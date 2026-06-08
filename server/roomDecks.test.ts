import { describe, expect, it } from 'vitest';
import { createRoomState } from './rooms';
import { dealFromRoomDeck, getRoomDeck, resetRoomDeck } from './roomDecks';

describe('room decks', () => {
  it('keeps each room deck independent when another room resets', () => {
    const roomA = createRoomState('111111');
    const roomB = createRoomState('222222');

    const firstBCard = dealFromRoomDeck(roomB);
    const roomBRemainingAfterDeal = getRoomDeck(roomB).remaining();

    resetRoomDeck(roomA);

    expect(getRoomDeck(roomB).remaining()).toBe(roomBRemainingAfterDeal);
    expect(dealFromRoomDeck(roomB)).not.toEqual(firstBCard);
    expect(getRoomDeck(roomB).remaining()).toBe(roomBRemainingAfterDeal - 1);
  });
});
