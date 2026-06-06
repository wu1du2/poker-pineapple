// src/utils/pokerScoring.ts

// 牌型 ID 定义（参考之前的代码）
export const HandCategory = {
  HighCard: 1,
  OnePair: 2,
  TwoPairs: 3,
  ThreeOfAKind: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  FourOfAKind: 8,
  StraightFlush: 9
} as const;

export type HandCategory = typeof HandCategory[keyof typeof HandCategory];

export interface CardInput {
  id?: string;
  suit: string;
  rank: string;
}

export const HandCategoryName: { [key: number]: string } = {
  1: '高牌',
  2: '一对',
  3: '两对',
  4: '三条',
  5: '顺子',
  6: '同花',
  7: '葫芦',
  8: '四条',
  9: '同花顺'
};

const RANK_VALUE: { [key: string]: number } = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 基础强度分映射
const BASE_STRENGTH: Record<number, number> = {
  [HandCategory.HighCard]: 1,
  [HandCategory.OnePair]: 1,
  [HandCategory.TwoPairs]: 2,
  [HandCategory.ThreeOfAKind]: 3,
  [HandCategory.Straight]: 4,
  [HandCategory.Flush]: 5,
  [HandCategory.FullHouse]: 6,
  [HandCategory.FourOfAKind]: 10,
  [HandCategory.StraightFlush]: 15 // 默认为同花顺，皇家同花顺需特殊处理
};

// Slot 倍率
const SLOT_MULTIPLIERS: Record<number, number> = {
  1: 5,
  2: 3,
  3: 1
};

export interface PlayerSlotInfo {
  seatIndex: number;
  hasPlayed: boolean; // 是否参与了该道（有2张牌）
  category: number;   // 牌型 ID
  isRoyal?: boolean;  // 是否是皇家同花顺 (特判)
  isSurrendered?: boolean;
}

export interface SettlementResult {
  seatIndex: number;
  scoreDelta: number; // 分数变化量 (+/-)
}

export interface SlotSettlementResult {
  seatIndex: number;
  slot1Delta: number;
  slot2Delta: number;
  slot3Delta: number;
  totalLoserDelta: number;
  totalDelta: number;
  isTotalLoser: boolean;
}

export interface GameSettlementSeat {
  slots: Record<number, CardInput[]>;
  isAway?: boolean;
  isSurrendered?: boolean;
}

export interface GameSettlementResult {
  settlementResults: SlotSettlementResult[];
  winningSlots: Record<number, number[]>;
  calculatedResults: Record<number, Record<number, string>>;
  totalDeltaSum: number;
}

export function calculateHandScore(cards: CardInput[]): number {
  if (cards.length !== 5) return 0;

  const values = cards
    .map(c => RANK_VALUE[c.rank] || 0)
    .sort((a, b) => b - a);
    
  const firstSuit = cards[0]?.suit;
  const isFlush = firstSuit ? cards.every(c => c.suit === firstSuit) : false;
  
  let isStraight = true;
  for (let i = 0; i < 4; i++) {
    if ((values[i] ?? 0) - (values[i + 1] ?? 0) !== 1) {
      isStraight = false;
      break;
    }
  }
  
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    values[0] = 5; values[1] = 4; values[2] = 3; values[3] = 2; values[4] = 1; 
  }

  const counts: { [key: number]: number } = {};
  values.forEach(v => { 
    counts[v] = (counts[v] || 0) + 1; 
  });

  const groups = Object.keys(counts).map(k => ({ val: parseInt(k), count: counts[parseInt(k)] }));
  
  groups.sort((a, b) => {
    const countA = a?.count || 0;
    const countB = b?.count || 0;
    if (countB !== countA) return countB - countA;
    return (b?.val || 0) - (a?.val || 0);
  });

  let category = 1;
  let sortedValues = values; 

  const g = (idx: number) => groups[idx] ? groups[idx].val : 0;
  const c = (idx: number) => groups[idx] ? groups[idx].count : 0;

  if (isFlush && isStraight) { category = 9; sortedValues = values; }
  else if (c(0) === 4) { category = 8; sortedValues = [g(0), g(1), 0, 0, 0]; }
  else if (c(0) === 3 && c(1) === 2) { category = 7; sortedValues = [g(0), g(1), 0, 0, 0]; }
  else if (isFlush) { category = 6; sortedValues = values; }
  else if (isStraight) { category = 5; sortedValues = values; }
  else if (c(0) === 3) { category = 4; sortedValues = [g(0), g(1), g(2), 0, 0]; }
  else if (c(0) === 2 && c(1) === 2) { category = 3; sortedValues = [g(0), g(1), g(2), 0, 0]; }
  else if (c(0) === 2) { category = 2; sortedValues = [g(0), g(1), g(2), g(3), 0]; }
  else { category = 1; sortedValues = values; }

  let score = category << 20;
  score |= (sortedValues[0] || 0) << 16;
  score |= (sortedValues[1] || 0) << 12;
  score |= (sortedValues[2] || 0) << 8;
  score |= (sortedValues[3] || 0) << 4;
  score |= (sortedValues[4] || 0);

  return score;
}

export function calculateHandScore5of7(cards: CardInput[]): { score: number, category: number } {
  if (cards.length < 5) return { score: 0, category: 0 };
  
  let maxScore = -1;
  
  const combine = (source: CardInput[], count: number): CardInput[][] => {
      if (count === 0) return [[]];
      if (source.length === 0) return [];
      const [first, ...rest] = source;
      if (!first) return [];
      const withFirst = combine(rest, count - 1).map(c => [first, ...c]);
      const withoutFirst = combine(rest, count);
      return [...withFirst, ...withoutFirst];
  };

  const combinations = combine(cards, 5);
  
  for (const comb of combinations) {
    const score = calculateHandScore(comb);
    if (score > maxScore) maxScore = score;
  }

  return { score: maxScore, category: maxScore >> 20 };
}

/**
 * 计算结算分数
 * @param players 所有玩家在当前 Slot 的信息
 * @param winnerSeatIndices 当前 Slot 获胜玩家的座位号列表
 * @param slotId 当前 Slot ID (1, 2, 3)
 */
export function calculateSlotSettlement(
  players: PlayerSlotInfo[],
  winnerSeatIndices: number[],
  slotId: number
): SettlementResult[] {
  // 0. 初始化结果
  const results: SettlementResult[] = players.map(p => ({
    seatIndex: p.seatIndex,
    scoreDelta: 0
  }));

  // 1. 边界检查：如果没有赢家，或者没有输家（全员平局），或者没人玩，直接返回0
  const activePlayers = players.filter(p => p.hasPlayed);
  if (winnerSeatIndices.length === 0 || activePlayers.length === 0) return results;
  
  // 输家 = 参与了该道 且 不在赢家列表中
  const losers = activePlayers.filter(p => !winnerSeatIndices.includes(p.seatIndex));
  
  // 如果没有输家（即所有人都是赢家），则不产生分数流动
  if (losers.length === 0) return results;

  // 2. 获取赢家基准强度
  // 任取一个赢家的数据来计算强度（理论上所有赢家牌型强度应该是一样的，或者至少分数一样）
  const firstWinnerIndex = winnerSeatIndices[0];
  const winnerInfo = activePlayers.find(p => p.seatIndex === firstWinnerIndex);

  if (!winnerInfo) {
    console.error("Winner info not found in player list");
    return results;
  }

  let strength = BASE_STRENGTH[winnerInfo.category] || 1;
  // 特判皇家同花顺
  if (winnerInfo.category === HandCategory.StraightFlush && winnerInfo.isRoyal) {
    strength = 20;
  }

  // 3. 计算输分 (Unit Loss)
  const multiplier = SLOT_MULTIPLIERS[slotId] || 1;
  const unitLoss = strength * multiplier;

  // 4. 执行结算
  let totalPot = 0;

  // 4.1 扣除输家分数
  losers.forEach(loser => {
    const res = results.find(r => r.seatIndex === loser.seatIndex);
    if (res) {
      const loss = loser.isSurrendered ? Math.ceil(unitLoss / 2) : unitLoss;
      res.scoreDelta -= loss;
      totalPot += loss;
    }
  });

  // 4.2 分配给赢家
  // 向下取整，保证整数
  const winAmountPerPerson = Math.floor(totalPot / winnerSeatIndices.length);
  const remainder = totalPot % winnerSeatIndices.length;

  winnerSeatIndices.forEach((winnerIdx, index) => {
    const res = results.find(r => r.seatIndex === winnerIdx);
    if (res) {
      res.scoreDelta += winAmountPerPerson + (index === 0 ? remainder : 0);
    }
  });
  
  return results;
}

/**
 * 计算包含通输逻辑的总结算结果
 * @param slotResults 3个slot的结算结果
 * @param allPlayerSeatIndices 所有玩家的座位号列表
 */
export function calculateTotalSettlement(
  slotResults: SettlementResult[][],
  allPlayerSeatIndices: number[],
  surrenderedSeatIndices: number[] = []
): SlotSettlementResult[] {
  // 1. 统计每个玩家是否赢过任何一个slot
  const hasWonAnySlot: Record<number, boolean> = {};
  allPlayerSeatIndices.forEach(seatIndex => {
    hasWonAnySlot[seatIndex] = false;
  });

  slotResults.forEach(slotResult => {
    slotResult.forEach(result => {
      if (result.scoreDelta > 0) {
        hasWonAnySlot[result.seatIndex] = true;
      }
    });
  });

  // 2. 识别通输玩家和非通输玩家
  const totalLosers = allPlayerSeatIndices.filter(seatIndex => !hasWonAnySlot[seatIndex]);
  const nonTotalLosers = allPlayerSeatIndices.filter(seatIndex => hasWonAnySlot[seatIndex]);

  // 2. 初始化总结算结果
    const totalResults: SlotSettlementResult[] = allPlayerSeatIndices.map(seatIndex => {
      const slot1Delta = slotResults[0]?.find(r => r.seatIndex === seatIndex)?.scoreDelta || 0;
      const slot2Delta = slotResults[1]?.find(r => r.seatIndex === seatIndex)?.scoreDelta || 0;
      const slot3Delta = slotResults[2]?.find(r => r.seatIndex === seatIndex)?.scoreDelta || 0;
      const slotScoreDelta = slot1Delta + slot2Delta + slot3Delta;
      
      return {
        seatIndex,
        slot1Delta,
        slot2Delta,
        slot3Delta,
        totalLoserDelta: 0,
        totalDelta: slotScoreDelta,
        isTotalLoser: !hasWonAnySlot[seatIndex]
      };
    });

  // 4. 通输逻辑计算
  if (totalLosers.length > 0 && nonTotalLosers.length > 0) {
    // 计算惩罚：通输玩家均分60点惩罚
    const unitPenalty = Math.floor(60 / totalLosers.length);
    const remainderPenalty = 60 % totalLosers.length;
    let totalPenaltyPot = 0;
    
    totalLosers.forEach((seatIndex, index) => {
        const result = totalResults.find(r => r.seatIndex === seatIndex);
        if (result) {
          const basePenalty = unitPenalty + (index === 0 ? remainderPenalty : 0);
          const penalty = surrenderedSeatIndices.includes(seatIndex) ? Math.ceil(basePenalty / 2) : basePenalty;
          result.totalLoserDelta -= penalty;
          result.totalDelta -= penalty;
          totalPenaltyPot += penalty;
        }
      });
    
    // 计算获益：非通输玩家均分实际扣出的通输惩罚
    const unitBenefit = Math.floor(totalPenaltyPot / nonTotalLosers.length);
    const remainderBenefit = totalPenaltyPot % nonTotalLosers.length;
    
    nonTotalLosers.forEach((seatIndex, index) => {
        const result = totalResults.find(r => r.seatIndex === seatIndex);
        if (result) {
          const benefit = unitBenefit + (index === 0 ? remainderBenefit : 0);
          result.totalLoserDelta += benefit;
          result.totalDelta += benefit;
        }
      });
  }

  return totalResults;
}

export function calculateGameSettlement(
  seats: (GameSettlementSeat | null)[],
  communityCards: CardInput[]
): GameSettlementResult {
  const winningSlots: Record<number, number[]> = {};
  const calculatedResults: Record<number, Record<number, string>> = {};
  const settlementResults: SlotSettlementResult[] = [];
  const slotScores: Record<number, { seatIndex: number, score: number, category: number, isRoyal: boolean }[]> = {
    1: [], 2: [], 3: []
  };
  const playerSlotInfos: Record<number, Record<number, PlayerSlotInfo>> = {};

  if (communityCards.length < 3) {
    return { settlementResults, winningSlots, calculatedResults, totalDeltaSum: 0 };
  }

  const activeSeatIndices = seats
    .map((seat, seatIndex) => ({ seat, seatIndex }))
    .filter(({ seat }) => seat !== null && !seat.isAway)
    .map(({ seatIndex }) => seatIndex);

  if (
    activeSeatIndices.length > 0 &&
    activeSeatIndices.every((seatIndex) => seats[seatIndex]?.isSurrendered)
  ) {
    return {
      settlementResults: activeSeatIndices.map((seatIndex) => ({
        seatIndex,
        slot1Delta: 0,
        slot2Delta: 0,
        slot3Delta: 0,
        totalLoserDelta: 0,
        totalDelta: 0,
        isTotalLoser: false
      })),
      winningSlots,
      calculatedResults,
      totalDeltaSum: 0
    };
  }

  seats.forEach((seat, seatIndex) => {
    if (!seat || seat.isAway) return;
    const seatCalculatedResults: Record<number, string> = {};
    const seatSlotInfos: Record<number, PlayerSlotInfo> = {};
    calculatedResults[seatIndex] = seatCalculatedResults;
    playerSlotInfos[seatIndex] = seatSlotInfos;

    for (let slotId = 1; slotId <= 3; slotId++) {
      const slotCards = seat.slots[slotId] || [];
      const visibleCards = slotCards.filter((card) => card.id !== 'hidden');
      
      if (seat.isSurrendered) {
        seatCalculatedResults[slotId] = '认输';
        seatSlotInfos[slotId] = {
          seatIndex,
          hasPlayed: true,
          category: 0,
          isSurrendered: true
        };
      } else if (visibleCards.length === 2) {
        const pool = [...communityCards, ...visibleCards];
        const result = calculateHandScore5of7(pool);
        const categoryName = HandCategoryName[result.category] || '高牌';
        const isRoyal = result.category === HandCategory.StraightFlush && ((result.score >> 16) & 0xF) === 14;

        seatCalculatedResults[slotId] = `${categoryName} (${result.score.toString(16).toUpperCase()})`;
        slotScores[slotId]?.push({ seatIndex, score: result.score, category: result.category, isRoyal });
        seatSlotInfos[slotId] = {
          seatIndex,
          hasPlayed: true,
          category: result.category,
          isRoyal,
          isSurrendered: false
        };
      } else {
        seatCalculatedResults[slotId] = '';
        seatSlotInfos[slotId] = {
          seatIndex,
          hasPlayed: false,
          category: 0,
          isSurrendered: false
        };
      }
    }
  });

  const slotResults: SettlementResult[][] = [];
  for (let slotId = 1; slotId <= 3; slotId++) {
    const scores = slotScores[slotId] || [];
    const maxScore = scores.length > 0 ? Math.max(...scores.map(score => score.score)) : 0;
    const winnerSeatIndices = scores.filter(score => score.score === maxScore).map(score => score.seatIndex);
    if (winnerSeatIndices.length > 0) {
      winnerSeatIndices.forEach((seatIndex) => {
        if (!winningSlots[seatIndex]) winningSlots[seatIndex] = [];
        winningSlots[seatIndex].push(slotId);
      });
    }

    const players: PlayerSlotInfo[] = [];
    seats.forEach((seat, seatIndex) => {
      if (!seat || seat.isAway) return;
      const slotInfo = playerSlotInfos[seatIndex]?.[slotId];
      if (slotInfo) players.push(slotInfo);
    });
    slotResults.push(calculateSlotSettlement(players, winnerSeatIndices, slotId));
  }

  const allPlayerSeatIndices = activeSeatIndices;
  const surrenderedSeatIndices = activeSeatIndices.filter((seatIndex) => seats[seatIndex]?.isSurrendered);
  settlementResults.push(...calculateTotalSettlement(slotResults, allPlayerSeatIndices, surrenderedSeatIndices));

  return {
    settlementResults,
    winningSlots,
    calculatedResults,
    totalDeltaSum: settlementResults.reduce((sum, result) => sum + result.totalDelta, 0)
  };
}
