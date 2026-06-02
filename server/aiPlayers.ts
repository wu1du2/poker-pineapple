export interface AiCard {
  id: string;
  suit: string;
  rank: string;
  color: string;
}

export interface AiPlayer {
  id: string;
  token: string;
  name: string;
  score: number;
  hand: AiCard[];
  slots: Record<number, AiCard[]>;
  shownSlots: number[];
  isFolded: boolean;
  isShowing: boolean;
  isReady: boolean;
  isAway: boolean;
  isBot?: boolean;
}

export function createAiPlayer(seatIndex: number): AiPlayer {
  return {
    id: `ai-${seatIndex}`,
    token: `ai-token-${seatIndex}`,
    name: `AI ${seatIndex + 1}`,
    score: 0,
    hand: [],
    slots: { 1: [], 2: [], 3: [] },
    shownSlots: [],
    isFolded: false,
    isShowing: false,
    isReady: false,
    isAway: false,
    isBot: true
  };
}

export function fillEmptySeatsWithAi(seats: (AiPlayer | null)[]): number {
  let added = 0;
  seats.forEach((seat, index) => {
    if (!seat) {
      seats[index] = createAiPlayer(index);
      added++;
    }
  });
  return added;
}

export function arrangeAiHandInOrder(player: AiPlayer): void {
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
}

export function revealAiPlayers(seats: (AiPlayer | null)[]): void {
  seats.forEach((seat) => {
    if (seat?.isBot && !seat.isAway) {
      seat.isShowing = true;
      seat.shownSlots = [1, 2, 3];
    }
  });
}
