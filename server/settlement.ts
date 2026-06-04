import { calculateGameSettlement, type SlotSettlementResult } from '../src/utils/pokerScoring';
import type { Card, Player } from './playerTypes';

export interface SettlementState {
  seats: (Player | null)[];
  communityCards: Card[];
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

  const result = calculateGameSettlement(state.seats, state.communityCards);
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
