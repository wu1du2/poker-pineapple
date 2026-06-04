import { createPlayerState, type Player } from './playerTypes';

export function createAiPlayer(seatIndex: number): Player {
  return createPlayerState({
    id: `ai-${seatIndex}`,
    token: `ai-token-${seatIndex}`,
    name: `AI ${seatIndex + 1}`,
    isBot: true
  });
}

export function fillEmptySeatsWithAi(seats: (Player | null)[]): number {
  let added = 0;
  seats.forEach((seat, index) => {
    if (!seat) {
      seats[index] = createAiPlayer(index);
      added++;
    }
  });
  return added;
}

export function arrangeAiHandInOrder(player: Player): void {
  if (!player.isBot) return;
  const arranged = player.hand.slice(0, 6);
  player.slots = {
    1: arranged.slice(0, 2),
    2: arranged.slice(2, 4),
    3: arranged.slice(4, 6)
  };
  player.hand = player.hand.slice(6);
  player.shownSlots = [];
  player.isFolded = false;
  player.isShowing = false;
  player.isReady = true;
  player.isDone = true;
}

export function revealAiPlayers(seats: (Player | null)[]): void {
  seats.forEach((seat) => {
    if (seat?.isBot && !seat.isAway) {
      seat.isShowing = true;
      seat.shownSlots = [1, 2, 3];
    }
  });
}
