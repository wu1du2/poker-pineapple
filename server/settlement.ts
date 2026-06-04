import { calculateGameSettlement, type SlotSettlementResult } from '../src/utils/pokerScoring';
import type { Card, Player } from './playerTypes';

export interface SettlementState {
  seats: (Player | null)[];
  communityCards: Card[];
  roundSeatIndices?: number[];
  settlementResults: SlotSettlementResult[];
  winningSlots: Record<number, number[]>;
  calculatedResults: Record<number, Record<number, string>>;
  isSettled: boolean;
}

export function clearSettlementState(state: SettlementState): void {
  state.settlementResults = [];
  state.winningSlots = {};
  state.calculatedResults = {};
  state.isSettled = false;
}

export function settleRoundScores(state: SettlementState): boolean {
  if (state.isSettled) return false;
  if (state.communityCards.length < 3) return false;

  const settlementSeats = state.roundSeatIndices && state.roundSeatIndices.length > 0
    ? state.seats.map((seat, seatIndex) => state.roundSeatIndices?.includes(seatIndex) ? seat : null)
    : state.seats;
  const result = calculateGameSettlement(settlementSeats, state.communityCards);
  state.settlementResults = result.settlementResults;
  state.winningSlots = result.winningSlots;
  state.calculatedResults = result.calculatedResults;

  result.settlementResults.forEach((settlement) => {
    const seat = state.seats[settlement.seatIndex];
    if (seat && !seat.isAway) {
      seat.score += settlement.totalDelta;
    }
  });

  state.isSettled = true;
  return true;
}
