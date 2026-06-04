import type { Player } from './playerTypes';

export const MIN_PLAYERS_TO_START = 2;

export function isActiveSeat(seat: Player | null): seat is Player {
  return Boolean(seat && !seat.isAway);
}

export function getActiveSeatIndices(seats: (Player | null)[]): number[] {
  return seats
    .map((seat, seatIndex) => ({ seat, seatIndex }))
    .filter(({ seat }) => isActiveSeat(seat))
    .map(({ seatIndex }) => seatIndex);
}

export function getReadyActiveSeatIndices(seats: (Player | null)[]): number[] {
  return seats
    .map((seat, seatIndex) => ({ seat, seatIndex }))
    .filter(({ seat }) => isActiveSeat(seat) && seat.isReady)
    .map(({ seatIndex }) => seatIndex);
}

export function canStartRound(seats: (Player | null)[]): boolean {
  const activeSeatIndices = getActiveSeatIndices(seats);
  if (activeSeatIndices.length < MIN_PLAYERS_TO_START) return false;
  return activeSeatIndices.every((seatIndex) => seats[seatIndex]?.isReady);
}

export function isRoundParticipant(roundSeatIndices: number[], seatIndex: number): boolean {
  return roundSeatIndices.includes(seatIndex);
}

export function areRoundParticipantsDone(seats: (Player | null)[], roundSeatIndices: number[]): boolean {
  if (roundSeatIndices.length === 0) return false;
  return roundSeatIndices.every((seatIndex) => {
    const seat = seats[seatIndex];
    return !seat || seat.isAway || seat.isDone;
  });
}
