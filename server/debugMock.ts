import type { Card, Player } from './playerTypes';

export type DebugCard = Card;
export type DebugSeat = Player;

export interface DebugGameState {
  seats: DebugSeat[];
  communityCards: Card[];
  billboard: string;
  phase: string;
}

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const BILLBOARD = '公告板 皇家同花顺20 同花顺15 炸弹10 葫芦6 同花5 顺子4 三条3 两对2';

function buildDeck(): DebugCard[] {
  const cards: DebugCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        suit,
        rank,
        color: suit === '♥' || suit === '♦' ? 'red' : 'black',
        id: `${suit}${rank}`
      });
    }
  }

  let seed = 2727;
  for (let index = cards.length - 1; index > 0; index--) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const swapIndex = seed % (index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }

  return cards;
}

export function buildMock6ShowdownState(): DebugGameState {
  const deck = buildDeck();
  const seats: DebugSeat[] = [];

  for (let seatIndex = 0; seatIndex < 6; seatIndex++) {
    const privateCards = deck.splice(0, 7);
    seats.push({
      id: `debug-socket-${seatIndex}`,
      token: `debug-token-${seatIndex}`,
      name: `Mock ${seatIndex + 1}`,
      score: 0,
      hand: privateCards.slice(6),
      slots: {
        1: privateCards.slice(0, 2),
        2: privateCards.slice(2, 4),
        3: privateCards.slice(4, 6)
      },
      shownSlots: [1, 2, 3],
      isFolded: false,
      isShowing: true,
      isReady: true,
      isDone: true,
      isAway: false,
      isSurrendered: false,
      surrenderCooldown: 0,
      isBot: false
    });
  }

  return {
    seats,
    communityCards: deck.splice(0, 5),
    billboard: BILLBOARD,
    phase: 'SHOWDOWN'
  };
}
