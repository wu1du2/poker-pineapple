// src/utils/pokerScoring.ts

// 牌型 ID 定义（参考之前的代码）
export enum HandCategory {
  HighCard = 1,
  OnePair = 2,
  TwoPairs = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9
}

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
      res.scoreDelta -= unitLoss;
      totalPot += unitLoss;
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
  allPlayerSeatIndices: number[]
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
    
    totalLosers.forEach((seatIndex, index) => {
        const result = totalResults.find(r => r.seatIndex === seatIndex);
        if (result) {
          const penalty = unitPenalty + (index === 0 ? remainderPenalty : 0);
          result.totalLoserDelta -= penalty;
          result.totalDelta -= penalty;
        }
      });
    
    // 计算获益：非通输玩家均分60点获益
    const unitBenefit = Math.floor(60 / nonTotalLosers.length);
    const remainderBenefit = 60 % nonTotalLosers.length;
    
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
