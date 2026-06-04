import { describe, expect, it } from 'vitest';
import { createRoomStore, DEFAULT_ROOM_ID } from './rooms';

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
});
