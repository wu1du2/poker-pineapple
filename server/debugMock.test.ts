import { describe, expect, it } from 'vitest';
import { buildMock6ShowdownState } from './debugMock';

describe('buildMock6ShowdownState', () => {
  it('creates six arranged players ready for showdown', () => {
    const state = buildMock6ShowdownState();

    expect(state.phase).toBe('SHOWDOWN');
    expect(state.communityCards).toHaveLength(5);
    expect(new Set(state.communityCards.map((card) => card.suit)).size).toBeGreaterThan(1);
    expect(state.seats).toHaveLength(6);

    state.seats.forEach((seat, index) => {
      expect(seat).not.toBeNull();
      expect(seat?.name).toBe(`Mock ${index + 1}`);
      expect(seat?.isReady).toBe(true);
      expect(seat?.isShowing).toBe(true);
      expect(seat?.hand).toHaveLength(1);
      expect(seat?.slots[1]).toHaveLength(2);
      expect(seat?.slots[2]).toHaveLength(2);
      expect(seat?.slots[3]).toHaveLength(2);

      const privateIds = [
        ...(seat?.hand ?? []),
        ...(seat?.slots[1] ?? []),
        ...(seat?.slots[2] ?? []),
        ...(seat?.slots[3] ?? [])
      ].map((card) => card.id);
      expect(new Set(privateIds).size).toBe(7);
    });
  });
});
