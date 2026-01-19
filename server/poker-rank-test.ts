// ==========================================
// PART 1: 基础牌力计算 (复用之前的逻辑)
// ==========================================

export interface CardInput {
  suit: string; // '♠', '♥', '♣', '♦'
  rank: string; // '2'...'10', 'J', 'Q', 'K', 'A'
}

const HandCategory = {
  HighCard: 1,
  OnePair: 2,
  TwoPair: 3,
  ThreeOfAKind: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  FourOfAKind: 8,
  StraightFlush: 9,
} as const;

const RANK_VALUE: { [key: string]: number } = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 5张牌算分核心函数
export function calculateHandScore(cards: CardInput[]): number {
  if (cards.length !== 5) throw new Error(`Hand must contain exactly 5 cards`);

  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  
  let isStraight = true;
  for (let i = 0; i < 4; i++) {
    if (values[i] - values[i + 1] !== 1) {
      isStraight = false;
      break;
    }
  }
  
  // 特殊顺子 A-5 (Wheel)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    values[0] = 5; values[1] = 4; values[2] = 3; values[3] = 2; values[4] = 1; 
  }

  const counts: { [key: number]: number } = {};
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });

  const groups = Object.keys(counts).map(k => ({ val: parseInt(k), count: counts[parseInt(k)] }));
  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.val - a.val;
  });

  let category: number;
  let sortedValues: number[] = []; 

  if (isFlush && isStraight) {
    category = HandCategory.StraightFlush;
    sortedValues = values; 
  }
  else if (groups[0].count === 4) {
    category = HandCategory.FourOfAKind;
    sortedValues = [groups[0].val, groups[1].val, 0, 0, 0];
  }
  else if (groups[0].count === 3 && groups[1].count === 2) {
    category = HandCategory.FullHouse;
    sortedValues = [groups[0].val, groups[1].val, 0, 0, 0];
  }
  else if (isFlush) {
    category = HandCategory.Flush;
    sortedValues = values;
  }
  else if (isStraight) {
    category = HandCategory.Straight;
    sortedValues = values;
  }
  else if (groups[0].count === 3) {
    category = HandCategory.ThreeOfAKind;
    sortedValues = [groups[0].val, groups[1].val, groups[2].val, 0, 0];
  }
  else if (groups[0].count === 2 && groups[1].count === 2) {
    category = HandCategory.TwoPair;
    sortedValues = [groups[0].val, groups[1].val, groups[2].val, 0, 0];
  }
  else if (groups[0].count === 2) {
    category = HandCategory.OnePair;
    sortedValues = [groups[0].val, groups[1].val, groups[2].val, groups[3].val, 0];
  }
  else {
    category = HandCategory.HighCard;
    sortedValues = values;
  }

  let score = category << 20;
  score |= (sortedValues[0] || 0) << 16;
  score |= (sortedValues[1] || 0) << 12;
  score |= (sortedValues[2] || 0) << 8;
  score |= (sortedValues[3] || 0) << 4;
  score |= (sortedValues[4] || 0);

  return score;
}

// ==========================================
// PART 2: 7选5 核心逻辑 (New Implementation)
// ==========================================

interface BestHandResult {
  score: number;
  bestCombination: CardInput[];
}

/**
 * 从 7 张牌中选出最大的 5 张牌组合
 * @param cards 必须是 7 张牌
 * @returns { score, bestCombination }
 */
export function calculateHandScore5of7(cards: CardInput[]): BestHandResult {
  if (cards.length !== 7) {
    console.error(`Error: Expected 7 cards, got ${cards.length}`);
    return { score: -1, bestCombination: [] };
  }

  let maxScore = -1;
  let bestComb: CardInput[] = [];

  // 简单的 7选5 组合遍历 (C(7,5) = 21 种情况)
  // 我们使用 3层循环剔除 2 张牌的方式来实现
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      // 剔除第 i 和第 j 张牌，剩下的就是 5 张
      const currentComb = cards.filter((_, index) => index !== i && index !== j);
      
      const score = calculateHandScore(currentComb);
      
      if (score > maxScore) {
        maxScore = score;
        bestComb = currentComb;
      }
    }
  }

  return {
    score: maxScore,
    bestCombination: bestComb
  };
}

// ==========================================
// PART 3: 测试代码
// ==========================================

function makeHand(str: string): CardInput[] {
  return str.split(' ').map(s => ({
    rank: s.slice(0, -1),
    suit: s.slice(-1) === 's' ? '♠' : (s.slice(-1) === 'h' ? '♥' : (s.slice(-1) === 'c' ? '♣' : '♦'))
  }));
}

function cardToString(cards: CardInput[]): string {
  return cards.map(c => `${c.rank}${c.suit}`).join(' ');
}

function runTests() {
  console.log("=== Running 7-Card Poker Tests ===\n");

  // 测试用例 1: 皇家同花顺埋在 7 张牌里
  // 牌面: As Ks Qs Js 10s (皇家同花顺) + 2h 3d (杂牌)
  const case1 = makeHand("As Ks Qs Js 10s 2h 3d");
  const result1 = calculateHandScore5of7(case1);
  console.log(`Test 1 (Royal Flush):`);
  console.log(`Input: ${cardToString(case1)}`);
  console.log(`Best:  ${cardToString(result1.bestCombination)}`);
  console.log(`Score: 0x${result1.score.toString(16).toUpperCase()}`);
  console.log(`Expected Category: 9 (Straight Flush)`);
  console.log(result1.score >> 20 === 9 ? "✅ PASS" : "❌ FAIL");
  console.log("--------------------------------------------------");

  // 测试用例 2: 四条 (公牌有三条，手牌有一张)
  // 公牌: 9s 9h 9d Ks 2c
  // 手牌: 9c Ah
  // 最佳: 9s 9h 9d 9c Ah (四条带A)
  const case2 = makeHand("9s 9h 9d Ks 2c 9c Ah");
  const result2 = calculateHandScore5of7(case2);
  console.log(`Test 2 (Four of a Kind):`);
  console.log(`Input: ${cardToString(case2)}`);
  console.log(`Best:  ${cardToString(result2.bestCombination)}`);
  console.log(`Score: 0x${result2.score.toString(16).toUpperCase()}`);
  console.log(`Expected Category: 8 (Four of a Kind)`);
  console.log(result2.score >> 20 === 8 ? "✅ PASS" : "❌ FAIL");
  console.log("--------------------------------------------------");

  // 测试用例 3: 葫芦 vs 同花 (同花更大)
  // 牌面: As Js 8s 5s 2s (同花) + Ad Ah (凑成三条A)
  // 这里的陷阱是：有三条A (As Ad Ah)，如果再来个对子可能凑葫芦，但这里只有同花
  // 等等，As Ad Ah Js 8s 是三条。
  // As Js 8s 5s 2s 是同花。
  // 同花(6) > 三条(4)。程序应该选同花。
  const case3 = makeHand("As Js 8s 5s 2s Ad Ah");
  const result3 = calculateHandScore5of7(case3);
  console.log(`Test 3 (Flush vs Three of a Kind):`);
  console.log(`Input: ${cardToString(case3)}`);
  console.log(`Best:  ${cardToString(result3.bestCombination)}`);
  console.log(`Score: 0x${result3.score.toString(16).toUpperCase()}`);
  console.log(`Expected Category: 6 (Flush)`);
  console.log(result3.score >> 20 === 6 ? "✅ PASS" : "❌ FAIL");
  console.log("--------------------------------------------------");

  // 测试用例 4: 踢脚问题 (两对)
  // 牌面: K K 8 8 4 2 A
  // 组合1: K K 8 8 A (两对带A) -> Score 较高
  // 组合2: K K 8 8 4 (两对带4) -> Score 较低
  const case4 = makeHand("Ks Kh 8s 8d 4c 2d As");
  const result4 = calculateHandScore5of7(case4);
  console.log(`Test 4 (Two Pair Kicker):`);
  console.log(`Input: ${cardToString(case4)}`);
  console.log(`Best:  ${cardToString(result4.bestCombination)}`);
  // 检查踢脚是否为 A (14/0xE)
  // Score 结构: [Category][K][K][8][8][Kicker]
  // 0x3DD88E
  const kicker = (result4.score & 0xF00) >> 8;
  console.log(`Kicker Value: ${kicker} (Expected 14/E)`);
  console.log(`Score: 0x${result4.score.toString(16).toUpperCase()}`);
  console.log(kicker === 14 ? "✅ PASS" : "❌ FAIL");
  console.log("--------------------------------------------------");

  // 测试用例 5: 异常长度
  const caseError = makeHand("As Ks");
  const resultError = calculateHandScore5of7(caseError);
  console.log(`Test 5 (Error Handling):`);
  console.log(`Score: ${resultError.score} (Expected -1)`);
  console.log(resultError.score === -1 ? "✅ PASS" : "❌ FAIL");
}

runTests();
