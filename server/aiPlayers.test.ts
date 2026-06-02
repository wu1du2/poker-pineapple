import { describe, expect, it } from 'vitest';
import { arrangeAiHandInOrder, fillEmptySeatsWithAi } from './aiPlayers';

const card = (id: string) => ({ id, suit: '♠', rank: id, color: 'black' });

describe('AI player helpers', () => {
  it('fills empty seats with named AI players without replacing humans', () => {
    const seats = [
      { id: 'human-1', token: 'token-1', name: 'Human', score: 12, hand: [], slots: { 1: [], 2: [], 3: [] }, shownSlots: [], isFolded: false, isShowing: false, isReady: false, isAway: false },
      null,
      null
    ];

    const added = fillEmptySeatsWithAi(seats);

    expect(added).toBe(2);
    expect(seats[0]?.name).toBe('Human');
    expect(seats[1]?.name).toBe('AI 2');
    expect(seats[2]?.name).toBe('AI 3');
    expect(seats[1]?.isBot).toBe(true);
    expect(seats[2]?.isBot).toBe(true);
  });

  it('pushes the first six AI cards into slots in order and leaves one hand card', () => {
    const player = {
      id: 'ai-1',
      token: 'ai-token-1',
      name: 'AI 1',
      score: 0,
      hand: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(card),
      slots: { 1: [], 2: [], 3: [] },
      shownSlots: [],
      isFolded: false,
      isShowing: false,
      isReady: false,
      isAway: false,
      isBot: true
    };

    arrangeAiHandInOrder(player);

    expect(player.slots[1].map((c) => c.id)).toEqual(['A', 'B']);
    expect(player.slots[2].map((c) => c.id)).toEqual(['C', 'D']);
    expect(player.slots[3].map((c) => c.id)).toEqual(['E', 'F']);
    expect(player.hand.map((c) => c.id)).toEqual(['G']);
    expect(player.isReady).toBe(true);
  });
});
