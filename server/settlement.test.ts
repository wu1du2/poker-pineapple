import { describe, expect, it } from 'vitest';
import { settleRoundScores, type SettlementState } from './settlement';
import { createPlayerState, type Card } from './playerTypes';

const card = (id: string, suit: string, rank: string): Card => ({
  id,
  suit,
  rank,
  color: suit === '♥' || suit === '♦' ? 'red' : 'black'
});

describe('server-authoritative settlement', () => {
  it('applies every player delta once, including AI seats', () => {
    const human = createPlayerState({ id: 'socket-0', token: 'token-0', name: 'Human' });
    const bot = createPlayerState({ id: 'ai-1', token: 'ai-token-1', name: 'AI 2', isBot: true });
    human.score = 10;
    bot.score = 20;
    human.slots = {
      1: [card('A♠', '♠', 'A'), card('A♦', '♦', 'A')],
      2: [card('5♠', '♠', '5'), card('6♦', '♦', '6')],
      3: [card('K♠', '♠', 'K'), card('K♣', '♣', 'K')]
    };
    bot.slots = {
      1: [card('Q♠', '♠', 'Q'), card('Q♦', '♦', 'Q')],
      2: [card('7♠', '♠', '7'), card('8♦', '♦', '8')],
      3: [card('9♥', '♥', '9'), card('9♦', '♦', '9')]
    };

    const state: SettlementState = {
      seats: [human, bot, null, null, null, null],
      communityCards: [
        card('2♣', '♣', '2'),
        card('3♦', '♦', '3'),
        card('4♣', '♣', '4'),
        card('9♠', '♠', '9'),
        card('K♦', '♦', 'K')
      ],
      settlementResults: [],
      winningSlots: {},
      calculatedResults: {},
      isSettled: false
    };

    const first = settleRoundScores(state);
    const second = settleRoundScores(state);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(state.seats[0]?.score).toBe(90);
    expect(state.seats[1]?.score).toBe(-60);
    expect(state.settlementResults.find((result) => result.seatIndex === 0)?.totalDelta).toBe(80);
    expect(state.settlementResults.find((result) => result.seatIndex === 1)?.totalDelta).toBe(-80);
    expect(state.winningSlots[0]).toEqual([1, 2, 3]);
  });
});
