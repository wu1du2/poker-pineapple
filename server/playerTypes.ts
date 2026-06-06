export interface Card {
  id: string;
  suit: string;
  rank: string;
  color: string;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  hand: Card[];
  slots: Record<number, Card[]>;
  shownSlots: number[];
  isFolded: boolean;
  isShowing: boolean;
  isReady: boolean;
  isDone: boolean;
  isAway: boolean;
  isSurrendered: boolean;
  surrenderCooldown: number;
  isBot: boolean;
}

export interface CreatePlayerStateOptions {
  id: string;
  token: string;
  name: string;
  isBot?: boolean;
}

export function createPlayerState(options: CreatePlayerStateOptions): Player {
  return {
    id: options.id,
    token: options.token,
    name: options.name,
    score: 0,
    hand: [],
    slots: { 1: [], 2: [], 3: [] },
    shownSlots: [],
    isFolded: false,
    isShowing: false,
    isReady: Boolean(options.isBot),
    isDone: false,
    isAway: false,
    isSurrendered: false,
    surrenderCooldown: 0,
    isBot: Boolean(options.isBot)
  };
}
