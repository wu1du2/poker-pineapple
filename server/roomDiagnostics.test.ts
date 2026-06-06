import { describe, expect, it } from 'vitest';
import { createPlayerState, type Player } from './playerTypes';
import { createRoomState } from './rooms';
import { describeRoomProgress } from './roomDiagnostics';

const player = (seatIndex: number, overrides: Partial<Player> = {}) => ({
  ...createPlayerState({
    id: `socket-${seatIndex}`,
    token: `token-${seatIndex}`,
    name: `Player ${seatIndex + 1}`
  }),
  ...overrides
});

describe('room progress diagnostics', () => {
  it('reports active seats that block the next round from starting', () => {
    const room = createRoomState('123456');
    room.phase = 'SHOWDOWN_SETTLED';
    room.isSettled = true;
    room.seats[0] = player(0, { isReady: true });
    room.seats[1] = player(1, { isReady: false });

    const diagnostics = describeRoomProgress(room);

    expect(diagnostics.canStartRound).toBe(false);
    expect(diagnostics.blockers).toContain('seat 1 Player 2 is active but not ready');
  });

  it('reports round participants that block showdown from starting', () => {
    const room = createRoomState('123456');
    room.phase = 'PLAYING';
    room.roundId = 7;
    room.roundSeatIndices = [0, 1, 2];
    room.seats[0] = player(0, { isDone: true });
    room.seats[1] = player(1, { isDone: false });
    room.seats[2] = player(2, { isDone: true });

    const diagnostics = describeRoomProgress(room);

    expect(diagnostics.canCompleteShowdown).toBe(false);
    expect(diagnostics.blockers).toContain('seat 1 Player 2 is a round participant but not done');
  });

  it('reports reveal phases that have no pending reveal timers', () => {
    const room = createRoomState('123456');
    room.phase = 'SHOWDOWN_TURN';
    room.roundId = 8;
    room.roundSeatIndices = [0, 1];
    room.seats[0] = player(0, { isDone: true });
    room.seats[1] = player(1, { isDone: true });

    const diagnostics = describeRoomProgress(room, { pendingRevealTimers: 0 });

    expect(diagnostics.blockers).toContain('SHOWDOWN_TURN has no pending reveal timer');
  });
});
