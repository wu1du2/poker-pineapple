import type { Card, Player } from './playerTypes';
import type { SlotSettlementResult } from '../src/utils/pokerScoring';

export const DEFAULT_ROOM_ID = '000000';
export const SEAT_COUNT = 6;
const BILLBOARD = '公告板 皇家同花顺20 同花顺15 炸弹10 葫芦6 同花5 顺子4 三条3 两对2';

export interface RoomState {
  roomId: string;
  seats: (Player | null)[];
  communityCards: Card[];
  settlementResults: SlotSettlementResult[];
  winningSlots: Record<number, number[]>;
  calculatedResults: Record<number, Record<number, string>>;
  isSettled: boolean;
  roundId: number;
  roundSeatIndices: number[];
  dealTurnCount: number;
  billboard: string;
  phase: string;
}

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    seats: new Array(SEAT_COUNT).fill(null),
    communityCards: [],
    settlementResults: [],
    winningSlots: {},
    calculatedResults: {},
    isSettled: false,
    roundId: 0,
    roundSeatIndices: [],
    dealTurnCount: 0,
    billboard: BILLBOARD,
    phase: 'LOBBY'
  };
}

export function createRoomStore() {
  const rooms = new Map<string, RoomState>();
  rooms.set(DEFAULT_ROOM_ID, createRoomState(DEFAULT_ROOM_ID));

  const generateRoomId = () => {
    let roomId = '';
    do {
      roomId = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    } while (rooms.has(roomId));
    return roomId;
  };

  return {
    createRoom() {
      const room = createRoomState(generateRoomId());
      rooms.set(room.roomId, room);
      return room;
    },
    findRoom(roomId: string) {
      return rooms.get(roomId);
    },
    getRoom(roomId: string) {
      let room = rooms.get(roomId);
      if (!room && roomId === DEFAULT_ROOM_ID) {
        room = createRoomState(DEFAULT_ROOM_ID);
        rooms.set(DEFAULT_ROOM_ID, room);
      }
      if (!room) throw new Error(`Room ${roomId} not found`);
      return room;
    },
    rooms
  };
}
