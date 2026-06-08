import type { Card } from './playerTypes';
import type { RoomState } from './rooms';

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class Deck {
  cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({
          suit,
          rank,
          color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
          id: suit + rank
        });
      }
    }

    for (let index = this.cards.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [this.cards[index], this.cards[swapIndex]] = [this.cards[swapIndex], this.cards[index]];
    }
  }

  deal() {
    const card = this.cards.pop();
    if (!card) throw new Error('Deck is empty');
    return card;
  }

  remaining() {
    return this.cards.length;
  }
}

const roomDecks = new Map<string, Deck>();

export function getRoomDeck(room: RoomState) {
  let deck = roomDecks.get(room.roomId);
  if (!deck) {
    deck = new Deck();
    roomDecks.set(room.roomId, deck);
  }
  return deck;
}

export function resetRoomDeck(room: RoomState) {
  const deck = getRoomDeck(room);
  deck.reset();
  return deck;
}

export function dealFromRoomDeck(room: RoomState) {
  return getRoomDeck(room).deal();
}

export function deleteRoomDeck(room: RoomState) {
  roomDecks.delete(room.roomId);
}
