import { describe, expect, it } from 'vitest';
import { arrangeAiHandInOrder, createAiPlayer, fillEmptySeatsWithAi, revealAiPlayers } from './aiPlayers';
import { createPlayerState } from './playerTypes';

const card = (id: string) => ({ id, suit: '♠', rank: id, color: 'black' });

describe('AI player helpers', () => {
  it('creates AI players ready for the next round but not done arranging', () => {
    const player = createAiPlayer(1);

    expect(player.isReady).toBe(true);
    expect(player.isDone).toBe(false);
  });

  it('fills empty seats with named AI players without replacing humans', () => {
    const seats = [
      { ...createPlayerState({ id: 'human-1', token: 'token-1', name: 'Human' }), score: 12 },
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
      ...createPlayerState({ id: 'ai-1', token: 'ai-token-1', name: 'AI 1', isBot: true }),
      hand: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(card),
      isReady: false,
      isDone: false
    };

    arrangeAiHandInOrder(player);

    expect(player.slots[1].map((c) => c.id)).toEqual(['A', 'B']);
    expect(player.slots[2].map((c) => c.id)).toEqual(['C', 'D']);
    expect(player.slots[3].map((c) => c.id)).toEqual(['E', 'F']);
    expect(player.hand.map((c) => c.id)).toEqual(['G']);
    expect(player.isReady).toBe(true);
    expect(player.isDone).toBe(true);
    expect(player.isShowing).toBe(false);
  });

  it('reveals AI players at showdown without revealing human players', () => {
    const seats = [
      createPlayerState({ id: 'human-1', token: 'token-1', name: 'Human' }),
      createPlayerState({ id: 'ai-2', token: 'ai-token-2', name: 'AI 2', isBot: true })
    ];

    revealAiPlayers(seats);

    expect(seats[0]?.isShowing).toBe(false);
    expect(seats[1]?.isShowing).toBe(true);
    expect(seats[1]?.shownSlots).toEqual([1, 2, 3]);
  });
});
