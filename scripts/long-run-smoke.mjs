import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(repoRoot, 'logs', 'runs', timestamp);
const port = Number(process.env.PORT || 3017);
const rounds = Number(process.env.ROUNDS || 40);
const baseUrl = `http://127.0.0.1:${port}`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Server did not respond at ${baseUrl}`);
}

function onceEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => {
    socket.emit(event, ...args, resolve);
  });
}

async function fetchProgress(roomId) {
  const response = await fetch(`${baseUrl}/debug/rooms/${roomId}/progress`);
  if (!response.ok) return { error: await response.text() };
  return response.json();
}

async function waitFor(predicate, label, getFailureState, timeoutMs = 18_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(100);
  }

  const failureState = await getFailureState();
  const failurePath = path.join(runDir, `failure-${Date.now()}.json`);
  await fs.writeFile(failurePath, JSON.stringify({ label, failureState }, null, 2));
  throw new Error(`${label} timed out; saved ${failurePath}`);
}

async function createPlayer(index, roomId) {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    reconnection: false
  });
  const player = {
    index,
    seatIndex: index,
    name: `LongRun ${index + 1}`,
    token: `long-run-${timestamp}-${index}`,
    socket,
    state: null,
    roomId
  };

  socket.on('update', (state) => {
    player.state = state;
  });
  socket.on('init', (state) => {
    player.state = state;
  });
  socket.on('room-joined', ({ roomId: joinedRoomId, state }) => {
    player.roomId = joinedRoomId;
    player.state = state;
  });

  await onceEvent(socket, 'connect');
  return player;
}

async function arrangePlayer(player) {
  const privateCards = await emitWithAck(player.socket, 'get-my-hand', player.seatIndex);
  const cards = [...(privateCards.hand || [])].slice(0, 6);
  if (cards.length < 6) {
    throw new Error(`${player.name} expected at least 6 cards, got ${cards.length}`);
  }

  const targets = [1, 1, 2, 2, 3, 3];
  for (let index = 0; index < targets.length; index++) {
    const ack = await emitWithAck(player.socket, 'move-card', {
      seatIndex: player.seatIndex,
      cardId: cards[index].id,
      target: targets[index],
      moveId: index + 1
    });
    if (!ack?.ok) {
      throw new Error(`${player.name} move ${cards[index].id} failed: ${ack?.reason || 'unknown'}`);
    }
  }
}

async function main() {
  await fs.mkdir(runDir, { recursive: true });

  const server = spawn('npm', ['run', 'server'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}`, PORT: String(port) }
  });

  const serverLog = [];
  server.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    serverLog.push(text);
    process.stdout.write(text);
  });
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    serverLog.push(text);
    process.stderr.write(text);
  });

  let players = [];
  let roomId = '';

  try {
    await waitForServer();

    const first = await createPlayer(0, '');
    first.socket.emit('create-room');
    const created = await onceEvent(first.socket, 'room-joined');
    roomId = created.roomId;
    first.roomId = roomId;
    first.state = created.state;
    players.push(first);

    for (let index = 1; index < 6; index++) {
      const player = await createPlayer(index, roomId);
      player.socket.emit('join-room', roomId);
      await onceEvent(player.socket, 'room-joined');
      players.push(player);
    }

    for (const player of players) {
      player.socket.emit('sit', {
        name: player.name,
        seatIndex: player.seatIndex,
        token: player.token
      });
    }

    await waitFor(
      () => players[0].state?.seats?.filter(Boolean).length === 6,
      'six players seated',
      () => fetchProgress(roomId)
    );

    const roundSummaries = [];

    for (let round = 1; round <= rounds; round++) {
      const previousRoundId = players[0].state?.roundId || 0;
      for (const player of players) {
        player.socket.emit('ready', { seatIndex: player.seatIndex, ready: true });
      }

      await waitFor(
        () => players[0].state?.phase === 'PLAYING' && players[0].state?.roundId > previousRoundId,
        `round ${round} started`,
        () => fetchProgress(roomId)
      );

      for (const player of players) {
        await arrangePlayer(player);
      }

      for (const player of players) {
        player.socket.emit('ready', { seatIndex: player.seatIndex, ready: true });
      }

      await waitFor(
        () => players[0].state?.phase === 'SHOWDOWN_SETTLED' &&
          players[0].state?.isSettled === true &&
          players[0].state?.settlementResults?.length === 6,
        `round ${round} settled`,
        () => fetchProgress(roomId),
        20_000
      );

      const progress = await fetchProgress(roomId);
      if (!progress.lastHealthCheck?.ok) {
        throw new Error(`round ${round} health check failed: ${progress.lastHealthCheck?.message || 'missing health report'}`);
      }
      const scores = players[0].state.scoreboard.map((entry) => ({
        name: entry.name,
        score: entry.score,
        isSeated: entry.isSeated
      }));
      roundSummaries.push({
        round,
        roundId: players[0].state.roundId,
        phase: players[0].state.phase,
        healthOk: progress.lastHealthCheck.ok,
        blockers: progress.diagnostics?.blockers || [],
        scores
      });

      if (round % 5 === 0) {
        console.log(`Long run settled ${round}/${rounds} rounds`);
      }
    }

    const finalProgress = await fetchProgress(roomId);
    await fs.writeFile(path.join(runDir, 'long-run-summary.json'), JSON.stringify({
      url: baseUrl,
      roomId,
      rounds,
      roundSummaries,
      finalProgress
    }, null, 2));
    await fs.writeFile(path.join(runDir, 'server.log'), serverLog.join(''));
    await fs.writeFile(path.join(runDir, 'summary.md'), [
      '# Long Run Smoke',
      '',
      `- URL: ${baseUrl}`,
      `- Room: ${roomId}`,
      `- Rounds: ${rounds}`,
      '- State: long-run-summary.json',
      '- Server log: server.log',
      ''
    ].join('\n'));
  } finally {
    players.forEach((player) => player.socket.disconnect());
    server.kill('SIGTERM');
  }

  console.log(`Long run artifacts saved to ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
