import { describe, expect, it } from 'vitest';
import { createPlayerState } from './playerTypes';

describe('player state representation', () => {
  it('creates human and AI players with the same state shape', () => {
    const human = createPlayerState({
      id: 'socket-1',
      token: 'token-1',
      name: 'Human'
    });
    const bot = createPlayerState({
      id: 'ai-1',
      token: 'ai-token-1',
      name: 'AI 1',
      isBot: true
    });

    expect(Object.keys(bot).sort()).toEqual(Object.keys(human).sort());
    expect(human.isBot).toBe(false);
    expect(bot.isBot).toBe(true);
  });
});
