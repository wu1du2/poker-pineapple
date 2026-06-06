import { describe, expect, it } from 'vitest';
import {
  createRoomStore,
  DEFAULT_ROOM_ID,
  restoreSeatScoreFromScoreboard,
  syncScoreboardFromSeats
} from './rooms';
import { createPlayerState } from './playerTypes';

describe('room store', () => {
  it('creates a default room for legacy smoke flows', () => {
    const store = createRoomStore();
    const room = store.getRoom(DEFAULT_ROOM_ID);

    expect(room.roomId).toBe(DEFAULT_ROOM_ID);
    expect(room.seats).toHaveLength(6);
    expect(room.phase).toBe('LOBBY');
  });

  it('creates six-digit room ids and retrieves the same room', () => {
    const store = createRoomStore();
    const room = store.createRoom();

    expect(room.roomId).toMatch(/^\d{6}$/);
    expect(store.getRoom(room.roomId)).toBe(room);
  });

  it('does not create missing rooms on join lookup', () => {
    const store = createRoomStore();

    expect(store.findRoom('123456')).toBeUndefined();
  });

  it('keeps kicked players on the room scoreboard and restores returning token scores', () => {
    const store = createRoomStore();
    const room = store.createRoom();
    const player = createPlayerState({ id: 'socket-1', token: 'token-1', name: 'Alice' });
    player.score = 42;
    room.seats[0] = player;

    syncScoreboardFromSeats(room);
    room.seats[0] = null;
    syncScoreboardFromSeats(room);

    expect(room.scoreboard).toEqual([
      expect.objectContaining({
        id: 'token-1',
        name: 'Alice',
        score: 42,
        isSeated: false
      })
    ]);

    const returningPlayer = createPlayerState({ id: 'socket-2', token: 'token-1', name: 'Alice 回来' });
    restoreSeatScoreFromScoreboard(room, returningPlayer);
    room.seats[1] = returningPlayer;
    syncScoreboardFromSeats(room);

    expect(room.seats[1]?.score).toBe(42);
    expect(room.scoreboard).toEqual([
      expect.objectContaining({
        id: 'token-1',
        name: 'Alice 回来',
        score: 42,
        isSeated: true,
        seatIndex: 1
      })
    ]);
  });
});
