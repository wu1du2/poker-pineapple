// src/utils/pokerScoring.test.ts
import { describe, it, expect } from 'vitest';
import { calculateSlotSettlement, calculateTotalSettlement, HandCategory } from './pokerScoring';
import type { PlayerSlotInfo } from './pokerScoring';

describe('Poker Scoring Logic', () => {
  
  // 辅助函数：快速创建玩家信息
  const createPlayer = (seatIndex: number, category: number, hasPlayed = true, isRoyal = false): PlayerSlotInfo => ({
    seatIndex, category, hasPlayed, isRoyal
  });

  it('场景1: Slot 1 (5倍), 单一赢家 (四条 vs 葫芦)', () => {
    // 赢家是 P1 (四条, 强度10), 输家是 P2 (葫芦)
    const players = [
      createPlayer(1, HandCategory.FourOfAKind), // Winner
      createPlayer(2, HandCategory.FullHouse)    // Loser
    ];
    const winners = [1];
    const slotId = 1; // 倍率 5

    const result = calculateSlotSettlement(players, winners, slotId);

    // 预期：
    // Unit Loss = 强度(10) * 倍率(5) = 50
    // P2 输 50
    // Pot = 50
    // P1 赢 50 / 1 = 50
    
    expect(result.find(r => r.seatIndex === 1)?.scoreDelta).toBe(50);
    expect(result.find(r => r.seatIndex === 2)?.scoreDelta).toBe(-50);
  });

  it('场景2: Slot 2 (3倍), 多人平分 (同花 vs 同花)', () => {
    // P1, P2 都是同花 (强度5), P3 是顺子 (输家)
    const players = [
      createPlayer(1, HandCategory.Flush), // Winner
      createPlayer(2, HandCategory.Flush), // Winner
      createPlayer(3, HandCategory.Straight) // Loser
    ];
    const winners = [1, 2];
    const slotId = 2; // 倍率 3

    const result = calculateSlotSettlement(players, winners, slotId);

    // 预期：
    // Unit Loss = 强度(5) * 倍率(3) = 15
    // P3 输 15
    // Pot = 15
    // P1, P2 平分 = 15 / 2 = 7 + 8 (余数给第一个人)
    
    expect(result.find(r => r.seatIndex === 3)?.scoreDelta).toBe(-15);
    expect(result.find(r => r.seatIndex === 1)?.scoreDelta).toBe(8);
    expect(result.find(r => r.seatIndex === 2)?.scoreDelta).toBe(7);
  });

  it('场景3: Slot 3 (1倍), 皇家同花顺 (特判)', () => {
    // P1 皇家同花顺 (强度20), P2 同花顺 (输家)
    const players = [
      createPlayer(1, HandCategory.StraightFlush, true, true), // Winner, Royal
      createPlayer(2, HandCategory.StraightFlush, true, false) // Loser
    ];
    const winners = [1];
    const slotId = 3; // 倍率 1

    const result = calculateSlotSettlement(players, winners, slotId);

    // 预期：
    // Unit Loss = 强度(20) * 倍率(1) = 20
    // P2 输 20
    // P1 赢 20
    
    expect(result.find(r => r.seatIndex === 1)?.scoreDelta).toBe(20);
    expect(result.find(r => r.seatIndex === 2)?.scoreDelta).toBe(-20);
  });

  it('场景4: 有人没玩这一道 (弃牌或没摆牌)', () => {
    // P1 赢, P2 输, P3 没玩
    const players = [
      createPlayer(1, HandCategory.OnePair),
      createPlayer(2, HandCategory.HighCard),
      createPlayer(3, HandCategory.HighCard, false) // hasPlayed = false
    ];
    const winners = [1];
    const slotId = 3;

    const result = calculateSlotSettlement(players, winners, slotId);

    // Unit Loss = 1 * 1 = 1
    // P2 输 1
    // P3 不变
    // P1 赢 1
    
    expect(result.find(r => r.seatIndex === 2)?.scoreDelta).toBe(-1);
    expect(result.find(r => r.seatIndex === 3)?.scoreDelta).toBe(0);
    expect(result.find(r => r.seatIndex === 1)?.scoreDelta).toBe(1);
  });

  it('场景5: 全员平局 (大家都是赢家)', () => {
    const players = [
      createPlayer(1, HandCategory.HighCard),
      createPlayer(2, HandCategory.HighCard)
    ];
    const winners = [1, 2];
    const slotId = 1;

    const result = calculateSlotSettlement(players, winners, slotId);

    // 没人输，没人赢
    expect(result.find(r => r.seatIndex === 1)?.scoreDelta).toBe(0);
    expect(result.find(r => r.seatIndex === 2)?.scoreDelta).toBe(0);
  });

  describe('通输逻辑测试', () => {
    it('场景1: 部分玩家通输，部分玩家非通输', () => {
      // 玩家1：赢了slot1，非通输
      // 玩家2：赢了slot2，非通输
      // 玩家3：没有赢任何slot，通输
      const slotResults = [
        [{ seatIndex: 1, scoreDelta: 50 }, { seatIndex: 2, scoreDelta: -50 }, { seatIndex: 3, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: -30 }, { seatIndex: 2, scoreDelta: 30 }, { seatIndex: 3, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }, { seatIndex: 3, scoreDelta: 0 }]
      ];
      
      const result = calculateTotalSettlement(slotResults, [1, 2, 3]);
      
      // 预期：
      // 通输玩家：玩家3，承担60点惩罚
      // 非通输玩家：玩家1和玩家2，均分60点获益（各30点）
      expect(result.find(r => r.seatIndex === 1)?.totalDelta).toBe(50 - 30 + 30); // 50
      expect(result.find(r => r.seatIndex === 2)?.totalDelta).toBe(-50 + 30 + 30); // 10
      expect(result.find(r => r.seatIndex === 3)?.totalDelta).toBe(0 - 60); // -60
      
      // 总分数变化量之和应该为0
      const totalDelta = result.reduce((sum, r) => sum + r.totalDelta, 0);
      expect(totalDelta).toBe(0);
    });

    it('场景2: 所有玩家都通输', () => {
      // 所有玩家都没有赢任何slot
      const slotResults = [
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }]
      ];
      
      const result = calculateTotalSettlement(slotResults, [1, 2]);
      
      // 预期：不执行任何惩罚和获益
      expect(result.find(r => r.seatIndex === 1)?.totalDelta).toBe(0);
      expect(result.find(r => r.seatIndex === 2)?.totalDelta).toBe(0);
      
      // 总分数变化量之和应该为0
      const totalDelta = result.reduce((sum, r) => sum + r.totalDelta, 0);
      expect(totalDelta).toBe(0);
    });

    it('场景3: 没有通输玩家', () => {
      // 所有玩家都赢过至少一个slot
      const slotResults = [
        [{ seatIndex: 1, scoreDelta: 50 }, { seatIndex: 2, scoreDelta: -50 }],
        [{ seatIndex: 1, scoreDelta: -30 }, { seatIndex: 2, scoreDelta: 30 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }]
      ];
      
      const result = calculateTotalSettlement(slotResults, [1, 2]);
      
      // 预期：不执行任何惩罚和获益
      expect(result.find(r => r.seatIndex === 1)?.totalDelta).toBe(50 - 30); // 20
      expect(result.find(r => r.seatIndex === 2)?.totalDelta).toBe(-50 + 30); // -20
      
      // 总分数变化量之和应该为0
      const totalDelta = result.reduce((sum, r) => sum + r.totalDelta, 0);
      expect(totalDelta).toBe(0);
    });

    it('场景4: 只有一个通输玩家', () => {
      // 玩家1：赢了slot1，非通输
      // 玩家2：赢了slot2，非通输
      // 玩家3：没有赢任何slot，通输（唯一通输玩家）
      const slotResults = [
        [{ seatIndex: 1, scoreDelta: 50 }, { seatIndex: 2, scoreDelta: -50 }, { seatIndex: 3, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: -30 }, { seatIndex: 2, scoreDelta: 30 }, { seatIndex: 3, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }, { seatIndex: 3, scoreDelta: 0 }]
      ];
      
      const result = calculateTotalSettlement(slotResults, [1, 2, 3]);
      
      // 预期：玩家3承担全部60点惩罚，玩家1和玩家2各获得30点获益
      expect(result.find(r => r.seatIndex === 3)?.totalDelta).toBe(-60);
      
      // 总分数变化量之和应该为0
      const totalDelta = result.reduce((sum, r) => sum + r.totalDelta, 0);
      expect(totalDelta).toBe(0);
    });

    it('场景5: 只有一个非通输玩家', () => {
      // 玩家1：赢了slot1，非通输（唯一非通输玩家）
      // 玩家2：没有赢任何slot，通输
      // 玩家3：没有赢任何slot，通输
      const slotResults = [
        [{ seatIndex: 1, scoreDelta: 50 }, { seatIndex: 2, scoreDelta: -25 }, { seatIndex: 3, scoreDelta: -25 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }, { seatIndex: 3, scoreDelta: 0 }],
        [{ seatIndex: 1, scoreDelta: 0 }, { seatIndex: 2, scoreDelta: 0 }, { seatIndex: 3, scoreDelta: 0 }]
      ];
      
      const result = calculateTotalSettlement(slotResults, [1, 2, 3]);
      
      // 预期：玩家1获得全部60点获益，玩家2和玩家3各承担30点惩罚
      expect(result.find(r => r.seatIndex === 1)?.totalDelta).toBe(50 + 60); // 110
      expect(result.find(r => r.seatIndex === 2)?.totalDelta).toBe(-25 - 30); // -55
      expect(result.find(r => r.seatIndex === 3)?.totalDelta).toBe(-25 - 30); // -55
      
      // 总分数变化量之和应该为0
      const totalDelta = result.reduce((sum, r) => sum + r.totalDelta, 0);
      expect(totalDelta).toBe(0);
    });
  });
});
