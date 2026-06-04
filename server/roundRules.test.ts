import { describe, expect, it } from 'vitest';
import { areRoundParticipantsDone, canStartRound, getReadyActiveSeatIndices } from './roundRules';
import { createPlayerState, type Player } from './playerTypes';

const player = (seatIndex: number, overrides: Partial<Player> = {}) => ({
  ...createPlayerState({
    id: `socket-${seatIndex}`,
    token: `token-${seatIndex}`,
    name: `Player ${seatIndex + 1}`
  }),
  ...overrides
});

describe('round rules', () => {
  it('requires at least two active seated players before starting', () => {
    const seats = [player(0, { isReady: true }), null, null, null, null, null];

    expect(canStartRound(seats)).toBe(false);
  });

  it('waits for every active seated player to be ready before starting', () => {
    const seats = [
      player(0, { isReady: true }),
      player(1, { isReady: true }),
      player(2, { isReady: false }),
      null,
      null,
      null
    ];

    expect(canStartRound(seats)).toBe(false);
  });

  it('starts with all ready active players and ignores away seats', () => {
    const seats = [
      player(0, { isReady: true }),
      player(1, { isReady: true }),
      player(2, { isReady: false, isAway: true }),
      null,
      null,
      null
    ];

    expect(canStartRound(seats)).toBe(true);
    expect(getReadyActiveSeatIndices(seats)).toEqual([0, 1]);
  });

  it('only waits for locked round participants to finish arranging', () => {
    const seats = [
      player(0, { isDone: true }),
      player(1, { isDone: true }),
      player(2, { isDone: false }),
      null,
      null,
      null
    ];

    expect(areRoundParticipantsDone(seats, [0, 1])).toBe(true);
  });
});
