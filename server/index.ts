import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMock6ShowdownState } from './debugMock';
import { arrangeAiHandInOrder, fillEmptySeatsWithAi } from './aiPlayers';
import { createPlayerState, type Card, type Player } from './playerTypes';
import { clearSettlementState, settleRoundScores } from './settlement';
import {
  createRoomStore,
  DEFAULT_ROOM_ID,
  restoreSeatScoreFromScoreboard,
  SEAT_COUNT,
  syncScoreboardFromSeats,
  type RoomState
} from './rooms';
import {
  areRoundParticipantsDone,
  canStartRound,
  getReadyActiveSeatIndices,
  isActiveSeat,
  isRoundParticipant
} from './roundRules';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

interface MoveCardPayload {
  seatIndex: number;
  cardId: string;
  target: string | number;
  moveId?: number;
}

interface MoveCardAck {
  ok: boolean;
  moveId?: number;
  serverMs: number;
  reason?: string;
}

class Deck {
  cards: Card[] = [];
  constructor() { this.reset(); }
  reset() {
    this.cards = [];
    for (let s of SUITS) for (let r of RANKS) 
      this.cards.push({ suit: s, rank: r, color: (s === '♥' || s === '♦') ? 'red' : 'black', id: s+r });
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal() { return this.cards.pop() as Card; }
}

const deck = new Deck();
const roomStore = createRoomStore();
const revealTimers = new Map<string, NodeJS.Timeout[]>();

function clearRevealTimers(room: RoomState) {
  const timers = revealTimers.get(room.roomId) || [];
  timers.forEach((timer) => clearTimeout(timer));
  revealTimers.delete(room.roomId);
}

function scheduleReveal(room: RoomState, delayMs: number, callback: () => void) {
  const timer = setTimeout(() => {
    const timers = revealTimers.get(room.roomId) || [];
    revealTimers.set(room.roomId, timers.filter((item) => item !== timer));
    callback();
  }, delayMs);
  revealTimers.set(room.roomId, [...(revealTimers.get(room.roomId) || []), timer]);
}

function joinSocketRoom(socket: Socket, room: RoomState) {
  const previousRoomId = socket.data.roomId;
  if (previousRoomId) socket.leave(previousRoomId);
  socket.data.roomId = room.roomId;
  socket.join(room.roomId);
}

function getSocketRoom(socket: Socket) {
  const roomId = socket.data.roomId || DEFAULT_ROOM_ID;
  return roomStore.getRoom(roomId);
}

function emitRoomUpdate(room: RoomState) {
  io.to(room.roomId).emit('update', getPublicState(room));
}

function isSeatFullyArranged(seat: Player) {
  return [1, 2, 3].every(slotId => (seat.slots?.[slotId]?.length || 0) === 2);
}

function revealRoundParticipants(room: RoomState) {
  room.roundSeatIndices.forEach((seatIndex) => {
    const seat = room.seats[seatIndex];
    if (isActiveSeat(seat)) {
      seat.isShowing = true;
      seat.shownSlots = [1, 2, 3];
    }
  });
}

function startNewRound(room: RoomState) {
  if (!canStartRound(room.seats)) return;

  clearRevealTimers(room);
  room.dealTurnCount = 0;
  deck.reset();
  room.communityCards = [];
  clearSettlementState(room);
  room.roundId += 1;
  room.roundSeatIndices = getReadyActiveSeatIndices(room.seats);
  room.phase = 'PLAYING';

  room.seats.forEach((p, seatIndex) => {
    if (!p) return;

    p.hand = [];
    p.slots = { 1: [], 2: [], 3: [] };
    p.shownSlots = [];
    p.isFolded = false;
    p.isShowing = false;
    p.isDone = false;
    p.isSurrendered = false;
    p.surrenderCooldown = Math.max(0, (p.surrenderCooldown || 0) - 1);

    if (p.isAway || !isRoundParticipant(room.roundSeatIndices, seatIndex)) {
      p.isReady = false;
      return;
    }

    for (let i = 0; i < 7; i++) p.hand.push(deck.deal());
    p.isReady = Boolean(p.isBot);
    arrangeAiHandInOrder(p);
  });

  room.communityCards.push(deck.deal(), deck.deal(), deck.deal());
  syncScoreboardFromSeats(room);
  io.to(room.roomId).emit('reset-table');
  emitRoomUpdate(room);
}

function completeShowdown(room: RoomState) {
  clearRevealTimers(room);
  const revealRoundId = room.roundId;
  room.phase = 'SHOWDOWN_REVEAL';
  revealRoundParticipants(room);

  emitRoomUpdate(room);

  scheduleReveal(room, 2000, () => {
    if (room.roundId !== revealRoundId || room.phase !== 'SHOWDOWN_REVEAL') return;
    if (room.communityCards.length < 4) {
      room.communityCards.push(deck.deal());
    }
    room.dealTurnCount = Math.max(0, room.communityCards.length - 3);
    room.phase = 'SHOWDOWN_TURN';
    emitRoomUpdate(room);
  });

  scheduleReveal(room, 4000, () => {
    if (room.roundId !== revealRoundId || room.phase !== 'SHOWDOWN_TURN') return;
    if (room.communityCards.length < 5) {
      room.communityCards.push(deck.deal());
    }
    room.dealTurnCount = Math.max(0, room.communityCards.length - 3);
    room.phase = 'SHOWDOWN_RIVER';
    emitRoomUpdate(room);
  });

  scheduleReveal(room, 5000, () => {
    if (room.roundId !== revealRoundId || room.phase !== 'SHOWDOWN_RIVER') return;
    settleRoundScores(room);
    syncScoreboardFromSeats(room);
    room.phase = 'SHOWDOWN_SETTLED';
    emitRoomUpdate(room);
    io.to(room.roomId).emit('all-players-ready');
    io.to(room.roomId).emit('auto-calculate');
  });
}

app.post('/debug/mock6-showdown', (_req, res) => {
  const room = roomStore.getRoom(DEFAULT_ROOM_ID);
  room.dealTurnCount = 2;
  const mockState = buildMock6ShowdownState();
  room.seats = mockState.seats;
  room.communityCards = mockState.communityCards;
  room.billboard = mockState.billboard;
  room.phase = mockState.phase;
  room.roundSeatIndices = mockState.seats.map((_, seatIndex) => seatIndex);
  clearSettlementState(room);
  settleRoundScores(room);
  syncScoreboardFromSeats(room);
  io.to(room.roomId).emit('reset-table');
  emitRoomUpdate(room);
  res.json(getPublicState(room));
});

io.on('connection', (socket: Socket) => {
  const defaultRoom = roomStore.getRoom(DEFAULT_ROOM_ID);
  joinSocketRoom(socket, defaultRoom);
  socket.emit('init', getPublicState(defaultRoom));

  socket.on('create-room', () => {
    const room = roomStore.createRoom();
    joinSocketRoom(socket, room);
    socket.emit('room-joined', { roomId: room.roomId, state: getPublicState(room) });
  });

  socket.on('join-room', (roomId: string) => {
    const normalizedRoomId = String(roomId || '').trim();
    const room = /^\d{6}$/.test(normalizedRoomId) ? roomStore.findRoom(normalizedRoomId) : undefined;
    if (!room) {
      socket.emit('room-error', { message: '房间不存在' });
      return;
    }
    joinSocketRoom(socket, room);
    socket.emit('room-joined', { roomId: room.roomId, state: getPublicState(room) });
  });

  // --- 新增：会话恢复机制 ---
  socket.on('restore-session', (payload) => {
    const token = typeof payload === 'string' ? payload : payload?.token;
    const requestedRoomId = typeof payload === 'string' ? DEFAULT_ROOM_ID : payload?.roomId;
    if (!token) return;
    const room = roomStore.findRoom(requestedRoomId || DEFAULT_ROOM_ID);
    if (!room) {
      socket.emit('room-error', { message: '房间不存在' });
      return;
    }
    joinSocketRoom(socket, room);
    let found = false;
    room.seats.forEach((seat, index) => {
      // 如果找到该 Token 对应的座位，更新 Socket ID
      if (seat && seat.token === token) {
        seat.id = socket.id; // 关键：更新为最新的 Socket ID
        found = true;
        // 告诉前端：你已经找回了这个座位
        socket.emit('session-restored', { seatIndex: index, roomId: room.roomId });
      }
    });
    if (found) {
      console.log(`Player restored session: ${token} -> ${socket.id} in room ${room.roomId}`);
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    } else {
      socket.emit('room-joined', { roomId: room.roomId, state: getPublicState(room) });
    }
  });

  // --- 修改：入座时绑定 Token ---
  socket.on('sit', ({ name, seatIndex, token }) => {
    const room = getSocketRoom(socket);
    if (!room.seats[seatIndex]) {
      // const isFirstPlayer = gameState.seats.every(s => s === null); // 移除首位玩家判断
      const player = createPlayerState({
        id: socket.id,
        token: token, // 绑定 Token
        name
      });
      restoreSeatScoreFromScoreboard(room, player);
      room.seats[seatIndex] = player;
      // if (isFirstPlayer) gameState.dealerIndex = seatIndex; // 移除庄家设置
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    }
  });

  // 新增：切换暂离状态
  socket.on('toggle-away', () => {
    const room = getSocketRoom(socket);
    const seatIndex = room.seats.findIndex(s => s && s.id === socket.id);
    if (seatIndex !== -1) {
      const p = room.seats[seatIndex];
      p.isAway = !p.isAway;
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    }
  });

  socket.on('surrender', ({ seatIndex }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (!p || p.id !== socket.id || p.isAway) return;
    if (room.phase !== 'PLAYING') return;
    if (!isRoundParticipant(room.roundSeatIndices, seatIndex)) return;
    if ((p.surrenderCooldown || 0) > 0) return;

    p.isSurrendered = true;
    p.isDone = true;
    p.isReady = false;
    p.surrenderCooldown = 10;
    emitRoomUpdate(room);

    if (areRoundParticipantsDone(room.seats, room.roundSeatIndices)) {
      completeShowdown(room);
    }
  });

  socket.on('update-name', ({ seatIndex, name }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (p) {
      p.name = name.substring(0, 12);
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    }
  });

  socket.on('kick-seat', ({ seatIndex }) => {
    const room = getSocketRoom(socket);
    const targetSeatIndex = Number(seatIndex);
    if (!Number.isInteger(targetSeatIndex) || targetSeatIndex < 0 || targetSeatIndex >= SEAT_COUNT) return;

    const kickedSeat = room.seats[targetSeatIndex];
    if (!kickedSeat) return;

    room.seats[targetSeatIndex] = null;
    syncScoreboardFromSeats(room);
    io.to(kickedSeat.id).emit('seat-kicked', { seatIndex: targetSeatIndex, roomId: room.roomId });

    if (room.phase === 'PLAYING' && areRoundParticipantsDone(room.seats, room.roundSeatIndices)) {
      completeShowdown(room);
      return;
    }

    emitRoomUpdate(room);

    if (!room.phase?.startsWith('SHOWDOWN') && room.phase !== 'PLAYING' && canStartRound(room.seats)) {
      startNewRound(room);
    }
  });

  socket.on('update-score', ({ seatIndex, score }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (p) {
      const val = parseInt(score);
      if (!isNaN(val)) {
        p.score = val;
        syncScoreboardFromSeats(room);
        emitRoomUpdate(room);
      }
    }
  });

  socket.on('update-billboard', (text) => {
    const room = getSocketRoom(socket);
    room.billboard = text;
    emitRoomUpdate(room);
  });

  socket.on('fold', ({ seatIndex }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    // 增加 ID 校验，防止旧连接操作，且暂离玩家不可操作
    if (p && p.id === socket.id && !p.isAway) {
      p.isFolded = true;
      emitRoomUpdate(room);
    }
  });

  socket.on('show-hand', ({ seatIndex }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (p && p.id === socket.id && !p.isAway) {
      p.isShowing = true; 
      emitRoomUpdate(room);
    }
  });

  socket.on('show-slot', ({ seatIndex, slotId }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (p && p.id === socket.id && !p.isAway) {
      if (!p.shownSlots.includes(slotId)) {
        p.shownSlots.push(slotId);
        emitRoomUpdate(room);
      }
    }
  });

  socket.on('move-card', ({ seatIndex, cardId, target, moveId }: MoveCardPayload, ack?: (payload: MoveCardAck) => void) => {
    const startedAt = Date.now();
    const respond = (ok: boolean, reason?: string) => {
      ack?.({
        ok,
        moveId,
        serverMs: Date.now() - startedAt,
        ...(reason ? { reason } : {})
      });
    };

    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    // 严格校验 ID，且暂离玩家不可操作
    if (!p || p.id !== socket.id || p.isAway || p.isSurrendered) {
      respond(false, 'invalid-seat');
      return;
    }
    
    // 防误触：只有在 PLAYING 阶段允许移牌
    if (room.phase !== 'PLAYING') {
      respond(false, 'wrong-phase');
      return;
    }
    if (p.isDone) {
      respond(false, 'already-done');
      return;
    }

    let sourceLocation = 'hand';
    let cardIndex = p.hand.findIndex((c: any) => c.id === cardId);
    let card: Card | null = null;

    if (cardIndex !== -1) {
      card = p.hand[cardIndex];
    } else {
      for (let i = 1; i <= 3; i++) {
        const idx = p.slots[i].findIndex((c: any) => c.id === cardId);
        if (idx !== -1) {
          sourceLocation = `slot-${i}`;
          card = p.slots[i][idx];
          cardIndex = idx;
          break;
        }
      }
    }

    if (!card) {
      respond(false, 'missing-card');
      return;
    }

    if (target === 'hand') {
      if (sourceLocation === 'hand') {
        respond(false, 'already-in-hand');
        return;
      }
      const slotNum = parseInt(sourceLocation.split('-')[1]);
      p.slots[slotNum].splice(cardIndex, 1);
      p.hand.push(card);
    } 
    else {
      const slotNum = parseInt(String(target));
      if (isNaN(slotNum) || slotNum < 1 || slotNum > 3) {
        respond(false, 'invalid-target');
        return;
      }
      if (p.slots[slotNum].length >= 2) {
        respond(false, 'slot-full');
        return;
      }

      if (sourceLocation === 'hand') {
        p.hand.splice(cardIndex, 1);
      } else {
        const srcSlot = parseInt(sourceLocation.split('-')[1]);
        p.slots[srcSlot].splice(cardIndex, 1);
      }
      p.slots[slotNum].push(card);
    }

    emitRoomUpdate(room);
    respond(true);
  });

  socket.on('control', (action) => {
    const room = getSocketRoom(socket);
    if (action === 'fill-ai') {
      fillEmptySeatsWithAi(room.seats);
      room.seats.forEach((seat) => {
        if (seat) restoreSeatScoreFromScoreboard(room, seat);
      });
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    } else if (action === 'new-game') {
      startNewRound(room);
    } else if (action === 'deal-turn') {
      // 防误触：只有在 SHOWDOWN 阶段允许发牌
      if (room.phase !== 'SHOWDOWN') {
         console.log("Not in SHOWDOWN phase, skipping deal-turn");
         return;
      }
      
      // 校验是否所有人都已完成摆牌 (双重保险)
      if (!areRoundParticipantsDone(room.seats, room.roundSeatIndices)) {
        console.log("Not all players done, skipping deal-turn");
        return;
      }

      room.dealTurnCount++; // 发牌计数加1
      room.communityCards.push(deck.deal());
      if (room.communityCards.length >= 5) {
        settleRoundScores(room);
        syncScoreboardFromSeats(room);
      }
      emitRoomUpdate(room);
      
      if (room.dealTurnCount === 2) { // 计数达到2
        setTimeout(() => {
          io.to(room.roomId).emit('auto-calculate'); // 广播自动算分事件
        }, 1000); // 延迟1秒
      }
    }
    else if (action === 'deal-river') {
      room.communityCards.push(deck.deal());
      if (room.phase === 'SHOWDOWN' && room.communityCards.length >= 5) {
        settleRoundScores(room);
        syncScoreboardFromSeats(room);
      }
      emitRoomUpdate(room);
    } else if (action === 'settle-scores') {
      settleRoundScores(room);
      syncScoreboardFromSeats(room);
      emitRoomUpdate(room);
    }
  });

  socket.on('hard-reset', () => {
      const room = getSocketRoom(socket);
      clearRevealTimers(room);
      deck.reset();
      room.communityCards = [];
      // gameState.dealerIndex = -1; // 移除庄家重置
      room.seats = new Array(SEAT_COUNT).fill(null);
      room.scoreboard = [];
      room.billboard = "公告板 皇家同花顺20 同花顺15 炸弹10 葫芦6 同花5 顺子4 三条3 两对2";
      clearSettlementState(room);
      room.roundId = 0;
      room.roundSeatIndices = [];
      room.phase = 'LOBBY';
      emitRoomUpdate(room);
      io.to(room.roomId).emit('force-reload');
    });

  socket.on('get-my-hand', (seatIndex, callback) => {
      const room = getSocketRoom(socket);
      const p = room.seats[seatIndex];
      // 这里的 p.id 已经是 restore-session 更新过的最新 ID
      if (p && p.id === socket.id) {
        callback({ hand: p.hand, slots: p.slots });
      } else {
        callback({ hand: [], slots: { 1: [], 2: [], 3: [] } });
      }
  });

  // 新增：处理Ready事件
  socket.on('ready', ({ seatIndex, ready }) => {
    const room = getSocketRoom(socket);
    const p = room.seats[seatIndex];
    if (p && p.id === socket.id && !p.isAway) {
      if (room.phase === 'PLAYING') {
        if (!isRoundParticipant(room.roundSeatIndices, seatIndex)) return;
        if (p.isSurrendered) return;
        if (ready && !isSeatFullyArranged(p)) return;

        p.isDone = ready;

        if (areRoundParticipantsDone(room.seats, room.roundSeatIndices)) {
          completeShowdown(room);
        } else {
          emitRoomUpdate(room);
        }
        return;
      }

      if (room.phase.startsWith('SHOWDOWN') && !room.isSettled) return;

      p.isReady = ready;
      p.isDone = false;
      emitRoomUpdate(room);

      if (canStartRound(room.seats)) {
        startNewRound(room);
      }
    }
  });
});

function getPublicState(room: RoomState) {
  return {
    ...room,
    seats: room.seats.map(s => {
      if (!s) return null;
      
      const publicSlots: Record<number, Partial<Card>[]> = { 1: [], 2: [], 3: [] };
      for (let i = 1; i <= 3; i++) {
        const isSlotShown = s.isShowing || (s.shownSlots && s.shownSlots.includes(i));
        if (isSlotShown) {
          publicSlots[i] = s.slots[i];
        } else {
          publicSlots[i] = new Array(s.slots[i].length).fill({ id: 'hidden' }); 
        }
      }

      return { 
        ...s, 
        token: undefined, // 关键：不要把 token 广播给其他人
        hand: s.isShowing ? s.hand : null,
        slots: publicSlots,
        shownSlots: s.shownSlots || []
      };
    })
  };
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on ${PORT}`));
