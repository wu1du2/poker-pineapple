import { describe, expect, it } from 'vitest';
import { createPlayerState, type Card, type Player } from './playerTypes';
import { createRoomState } from './rooms';
import { finalizeRound } from './roundFinalizer';

const card = (id: string): Card => ({
  id,
  suit: id[0],
  rank: id.slice(1),
  color: id[0] === '♥' || id[0] === '♦' ? 'red' : 'black'
});

const player = (seatIndex: number, overrides: Partial<Player> = {}) => ({
  ...createPlayerState({
    id: `socket-${seatIndex}`,
    token: `token-${seatIndex}`,
    name: `Player ${seatIndex + 1}`
  }),
  slots: {
    1: [card('♠A'), card('♥K')],
    2: [card('♣Q'), card('♦J')],
    3: [card('♠10'), card('♥9')]
  },
  isDone: true,
  ...overrides
});

describe('round finalizer', () => {
  it('records a silent health check and round history for a valid settled round', () => {
    const room = createRoomState('123456');
    room.phase = 'SHOWDOWN_SETTLED';
    room.roundId = 9;
    room.roundSeatIndices = [0, 1];
    room.communityCards = [card('♠2'), card('♥3'), card('♣4'), card('♦5'), card('♠6')];
    room.seats[0] = player(0);
    room.seats[1] = player(1);
    room.settlementResults = [
      { seatIndex: 0, slot1Delta: 5, slot2Delta: 3, slot3Delta: 1, totalLoserDelta: 0, totalDelta: 9 },
      { seatIndex: 1, slot1Delta: -5, slot2Delta: -3, slot3Delta: -1, totalLoserDelta: 0, totalDelta: -9 }
    ];
    room.isSettled = true;

    const report = finalizeRound(room, { pendingRevealTimers: 0 });

    expect(report.ok).toBe(true);
    expect(report.severity).toBe('ok');
    expect(report.anomalies).toEqual([]);
    expect(room.lastHealthCheck).toEqual(report);
    expect(room.roundClosed).toBe(true);
    expect(room.roundHistory).toHaveLength(1);
    expect(room.roundHistory[0]).toMatchObject({
      roundId: 9,
      participantSeatIndices: [0, 1],
      healthOk: true,
      totalDeltaSum: 0
    });
  });

  it('reports anomalies without clearing visible results when a settled round is inconsistent', () => {
    const room = createRoomState('123456');
    room.phase = 'SHOWDOWN_SETTLED';
    room.roundId = 10;
    room.roundSeatIndices = [0, 1];
    room.communityCards = [card('♠2'), card('♥3'), card('♣4')];
    room.seats[0] = player(0);
    room.seats[1] = player(1, { slots: { 1: [card('♠A')], 2: [], 3: [] } });
    room.settlementResults = [
      { seatIndex: 0, slot1Delta: 1, slot2Delta: 0, slot3Delta: 0, totalLoserDelta: 0, totalDelta: 1 }
    ];
    room.isSettled = true;

    const report = finalizeRound(room, { pendingRevealTimers: 1 });

    expect(report.ok).toBe(false);
    expect(report.severity).toBe('error');
    expect(report.message).toContain('牌局状态异常');
    expect(report.anomalies).toEqual(expect.arrayContaining([
      'settled round should have 5 community cards, got 3',
      'settlementResults count 1 does not match participant count 2',
      'pending reveal timers remain after settlement: 1',
      'seat 1 Player 2 has incomplete slots'
    ]));
    expect(room.communityCards).toHaveLength(3);
    expect(room.settlementResults).toHaveLength(1);
    expect(room.roundHistory[0].healthOk).toBe(false);
  });
});
