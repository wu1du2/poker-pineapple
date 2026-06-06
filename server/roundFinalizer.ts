import { describeRoomProgress } from './roomDiagnostics';
import type { RoomHealthCheck, RoomState } from './rooms';

const ROUND_HISTORY_LIMIT = 20;

function participantCount(room: RoomState) {
  return room.roundSeatIndices.filter((seatIndex) => Boolean(room.seats[seatIndex])).length;
}

function hasCompleteSlots(room: RoomState, seatIndex: number) {
  const seat = room.seats[seatIndex];
  if (!seat) return false;
  return [1, 2, 3].every((slotId) => (seat.slots?.[slotId]?.length || 0) === 2);
}

function buildAnomalies(room: RoomState, pendingRevealTimers: number) {
  const anomalies: string[] = [];
  const participants = participantCount(room);

  if (room.phase !== 'SHOWDOWN_SETTLED') {
    anomalies.push(`round finalized while phase is ${room.phase}`);
  }
  if (!room.isSettled) {
    anomalies.push('round finalized before isSettled=true');
  }
  if (room.communityCards.length !== 5) {
    anomalies.push(`settled round should have 5 community cards, got ${room.communityCards.length}`);
  }
  if (pendingRevealTimers !== 0) {
    anomalies.push(`pending reveal timers remain after settlement: ${pendingRevealTimers}`);
  }
  if (room.settlementResults.length !== participants) {
    anomalies.push(`settlementResults count ${room.settlementResults.length} does not match participant count ${participants}`);
  }

  room.roundSeatIndices.forEach((seatIndex) => {
    const seat = room.seats[seatIndex];
    if (!seat) {
      anomalies.push(`seat ${seatIndex} is missing from settled round`);
      return;
    }
    if (!hasCompleteSlots(room, seatIndex) && !seat.isSurrendered) {
      anomalies.push(`seat ${seatIndex} ${seat.name} has incomplete slots`);
    }
  });

  const totalDeltaSum = room.settlementResults.reduce((sum, result) => sum + result.totalDelta, 0);
  if (totalDeltaSum !== 0) {
    anomalies.push(`settlement total delta should be 0, got ${totalDeltaSum}`);
  }

  return anomalies;
}

export function finalizeRound(room: RoomState, options: { pendingRevealTimers: number }): RoomHealthCheck {
  const anomalies = buildAnomalies(room, options.pendingRevealTimers);
  const diagnostics = describeRoomProgress(room, { pendingRevealTimers: options.pendingRevealTimers });
  const ok = anomalies.length === 0;
  const checkedAt = new Date().toISOString();
  const totalDeltaSum = room.settlementResults.reduce((sum, result) => sum + result.totalDelta, 0);
  const report: RoomHealthCheck = {
    roundId: room.roundId,
    phase: room.phase,
    ok,
    severity: ok ? 'ok' : 'error',
    message: ok ? '牌局状态正常' : `牌局状态异常：${anomalies[0]}`,
    anomalies,
    blockers: ok ? [] : diagnostics.blockers,
    checkedAt
  };

  room.lastHealthCheck = report;
  room.roundClosed = true;
  room.dealTurnCount = Math.max(room.dealTurnCount, Math.max(0, room.communityCards.length - 3));
  room.roundHistory.unshift({
    roundId: room.roundId,
    settledAt: checkedAt,
    participantSeatIndices: [...room.roundSeatIndices],
    participants: room.roundSeatIndices.map((seatIndex) => {
      const seat = room.seats[seatIndex];
      const settlement = room.settlementResults.find((result) => result.seatIndex === seatIndex);
      return {
        seatIndex,
        name: seat?.name || `Seat ${seatIndex}`,
        isBot: Boolean(seat?.isBot),
        score: seat?.score || 0,
        scoreDelta: settlement?.totalDelta || 0,
        isReady: Boolean(seat?.isReady),
        isDone: Boolean(seat?.isDone),
        isAway: Boolean(seat?.isAway),
        isSurrendered: Boolean(seat?.isSurrendered)
      };
    }),
    communityCards: room.communityCards.map((card) => ({ ...card })),
    settlementResults: room.settlementResults.map((result) => ({ ...result })),
    healthOk: ok,
    anomalies: [...anomalies],
    totalDeltaSum
  });
  room.roundHistory = room.roundHistory.slice(0, ROUND_HISTORY_LIMIT);

  return report;
}
