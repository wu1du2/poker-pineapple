import type { Card, Player } from './playerTypes';
import type { SlotSettlementResult } from '../src/utils/pokerScoring';

export const DEFAULT_ROOM_ID = '000000';
export const SEAT_COUNT = 6;
const BILLBOARD = '公告板 皇家同花顺20 同花顺15 炸弹10 葫芦6 同花5 顺子4 三条3 两对2';

export interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  isBot: boolean;
  isSeated: boolean;
  seatIndex: number | null;
}

export interface RoomHealthCheck {
  roundId: number;
  phase: string;
  ok: boolean;
  severity: 'ok' | 'warning' | 'error';
  message: string;
  anomalies: string[];
  blockers: string[];
  checkedAt: string;
}

export interface RoundHistoryEntry {
  roundId: number;
  settledAt: string;
  participantSeatIndices: number[];
  participants: Array<{
    seatIndex: number;
    name: string;
    isBot: boolean;
    score: number;
    scoreDelta: number;
    isReady: boolean;
    isDone: boolean;
    isAway: boolean;
    isSurrendered: boolean;
  }>;
  communityCards: Card[];
  settlementResults: SlotSettlementResult[];
  healthOk: boolean;
  anomalies: string[];
  totalDeltaSum: number;
}

export interface RoomState {
  roomId: string;
  seats: (Player | null)[];
  scoreboard: ScoreboardEntry[];
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
  roundClosed: boolean;
  lastHealthCheck: RoomHealthCheck | null;
  roundHistory: RoundHistoryEntry[];
}

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    seats: new Array(SEAT_COUNT).fill(null),
    scoreboard: [],
    communityCards: [],
    settlementResults: [],
    winningSlots: {},
    calculatedResults: {},
    isSettled: false,
    roundId: 0,
    roundSeatIndices: [],
    dealTurnCount: 0,
    billboard: BILLBOARD,
    phase: 'LOBBY',
    roundClosed: false,
    lastHealthCheck: null,
    roundHistory: []
  };
}

function getScoreboardId(player: Player): string {
  return player.token || player.id;
}

export function restoreSeatScoreFromScoreboard(room: RoomState, player: Player): void {
  const entry = room.scoreboard.find((item) => item.id === getScoreboardId(player));
  if (!entry) return;

  player.score = entry.score;
}

export function syncScoreboardFromSeats(room: RoomState): void {
  room.scoreboard.forEach((entry) => {
    entry.isSeated = false;
    entry.seatIndex = null;
  });

  room.seats.forEach((seat, seatIndex) => {
    if (!seat) return;

    const id = getScoreboardId(seat);
    const existing = room.scoreboard.find((entry) => entry.id === id);
    if (existing) {
      existing.name = seat.name;
      existing.score = seat.score;
      existing.isBot = seat.isBot;
      existing.isSeated = true;
      existing.seatIndex = seatIndex;
    } else {
      room.scoreboard.push({
        id,
        name: seat.name,
        score: seat.score,
        isBot: seat.isBot,
        isSeated: true,
        seatIndex
      });
    }
  });

  room.scoreboard.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
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
