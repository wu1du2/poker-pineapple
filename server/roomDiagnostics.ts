import type { Player } from './playerTypes';
import type { RoomState } from './rooms';
import {
  areRoundParticipantsDone,
  canStartRound,
  getActiveSeatIndices,
  getReadyActiveSeatIndices,
  isRoundParticipant
} from './roundRules';

export interface SeatProgressDiagnostic {
  seatIndex: number;
  name: string;
  isBot: boolean;
  isAway: boolean;
  isReady: boolean;
  isDone: boolean;
  isSurrendered: boolean;
  isRoundParticipant: boolean;
  handCount: number;
  slotCounts: Record<number, number>;
}

export interface RoomProgressDiagnostics {
  roomId: string;
  phase: string;
  roundId: number;
  isSettled: boolean;
  communityCount: number;
  roundSeatIndices: number[];
  activeSeatIndices: number[];
  readyActiveSeatIndices: number[];
  pendingRevealTimers: number;
  canStartRound: boolean;
  canCompleteShowdown: boolean;
  blockers: string[];
  seats: SeatProgressDiagnostic[];
}

interface DescribeOptions {
  pendingRevealTimers?: number;
}

function describeSeat(seat: Player, seatIndex: number, room: RoomState): SeatProgressDiagnostic {
  return {
    seatIndex,
    name: seat.name,
    isBot: seat.isBot,
    isAway: seat.isAway,
    isReady: seat.isReady,
    isDone: seat.isDone,
    isSurrendered: seat.isSurrendered,
    isRoundParticipant: isRoundParticipant(room.roundSeatIndices, seatIndex),
    handCount: seat.hand?.length || 0,
    slotCounts: {
      1: seat.slots?.[1]?.length || 0,
      2: seat.slots?.[2]?.length || 0,
      3: seat.slots?.[3]?.length || 0
    }
  };
}

export function describeRoomProgress(room: RoomState, options: DescribeOptions = {}): RoomProgressDiagnostics {
  const activeSeatIndices = getActiveSeatIndices(room.seats);
  const readyActiveSeatIndices = getReadyActiveSeatIndices(room.seats);
  const pendingRevealTimers = options.pendingRevealTimers || 0;
  const blockers: string[] = [];
  const isRevealInProgress = room.phase.startsWith('SHOWDOWN') && room.phase !== 'SHOWDOWN_SETTLED';
  const isNextRoundReadyPhase = room.phase !== 'PLAYING' && !isRevealInProgress;

  if (activeSeatIndices.length < 2 && isNextRoundReadyPhase) {
    blockers.push(`only ${activeSeatIndices.length} active seat(s), need at least 2`);
  }

  if (isNextRoundReadyPhase) {
    activeSeatIndices.forEach((seatIndex) => {
      const seat = room.seats[seatIndex];
      if (seat && !seat.isReady) {
        blockers.push(`seat ${seatIndex} ${seat.name} is active but not ready`);
      }
    });
  }

  if (room.phase === 'PLAYING') {
    room.roundSeatIndices.forEach((seatIndex) => {
      const seat = room.seats[seatIndex];
      if (!seat) {
        blockers.push(`seat ${seatIndex} is missing but still in roundSeatIndices`);
      } else if (!seat.isAway && !seat.isDone) {
        blockers.push(`seat ${seatIndex} ${seat.name} is a round participant but not done`);
      }
    });

    activeSeatIndices.forEach((seatIndex) => {
      if (!isRoundParticipant(room.roundSeatIndices, seatIndex)) {
        const seat = room.seats[seatIndex];
        blockers.push(`seat ${seatIndex} ${seat?.name || 'unknown'} is active but outside this round`);
      }
    });
  }

  if (isRevealInProgress && pendingRevealTimers === 0) {
    blockers.push(`${room.phase} has no pending reveal timer`);
  }

  return {
    roomId: room.roomId,
    phase: room.phase,
    roundId: room.roundId,
    isSettled: room.isSettled,
    communityCount: room.communityCards.length,
    roundSeatIndices: [...room.roundSeatIndices],
    activeSeatIndices,
    readyActiveSeatIndices,
    pendingRevealTimers,
    canStartRound: canStartRound(room.seats),
    canCompleteShowdown: areRoundParticipantsDone(room.seats, room.roundSeatIndices),
    blockers,
    seats: room.seats
      .map((seat, seatIndex) => seat ? describeSeat(seat, seatIndex, room) : null)
      .filter((seat): seat is SeatProgressDiagnostic => Boolean(seat))
  };
}
