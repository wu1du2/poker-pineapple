<script setup lang="ts">
import { reactive, ref, onMounted, computed } from 'vue';
import { io } from 'socket.io-client';
import PokerCard from './components/PokerCard.vue';

const socket = io(); 

// --- 移植的核心算法 (最终修复版) ---
interface CardInput {
  suit: string;
  rank: string;
}

const HandCategoryName: { [key: number]: string } = {
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

function calculateHandScore(cards: CardInput[]): number {
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

function calculateHandScore5of7(cards: CardInput[]): { score: number, category: number } {
  if (cards.length < 5) return { score: 0, category: 0 };
  
  let maxScore = -1;
  
  const combine = (source: any[], count: number): any[][] => {
      if (count === 0) return [[]];
      if (source.length === 0) return [];
      const [first, ...rest] = source;
      const withFirst = combine(rest, count - 1).map(c => [first, ...c]);
      const withoutFirst = combine(rest, count);
      return [...withFirst, ...withoutFirst];
  };

  const combinations = combine(cards, 5);
  
  for (const comb of combinations) {
    const s = calculateHandScore(comb);
    if (s > maxScore) maxScore = s;
  }

  return { score: maxScore, category: maxScore >> 20 };
}
// --- 移植的核心算法 (结束) ---


const myName = ref('Player' + Math.floor(Math.random()*100));
const mySeatIndex = ref(-1);
const myHand = ref<any[]>([]);
const mySlots = ref<{ [key: number]: any[] }>({ 1: [], 2: [], 3: [] });
const userToken = ref('');

// 存储计算结果
const calculatedResults = reactive<{ [key: number]: { [slotId: number]: string } }>({});
// 新增：存储获胜的 Slot。Key: seatIndex, Value: Array of winning slot IDs (e.g. [1, 3])
const winningSlots = reactive<{ [key: number]: number[] }>({});

const scoreInputs = reactive(Array.from({ length: 6 }, () => ({ add: '', sub: '' })));

const slotMultipliers: { [key: number]: string } = { 1: '5倍', 2: '3倍', 3: '1倍' };
const multiplierColors: { [key: number]: string } = { 1: '#ff5252', 2: '#ffd700', 3: '#69f0ae' };

interface Card {
  suit: string;
  rank: string;
  color: string;
  id: string;
}

interface Player {
  id: string;
  name: string;
  score: number;
  hand: Card[] | null;
  slots: { [key: number]: Card[] }; 
  shownSlots: number[];
  isFolded: boolean;
  isShowing: boolean;
}

interface GameState {
  seats: (Player | null)[];
  communityCards: Card[];
  billboard: string;
}

const gameState = reactive<GameState>({
  seats: new Array(6).fill(null),
  communityCards: [],
  billboard: ''
});

const totalScore = computed(() => {
  return gameState.seats.reduce((sum, seat) => sum + (seat ? seat.score : 0), 0);
});

const generateToken = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

onMounted(() => {
  const storedToken = localStorage.getItem('poker_user_token');
  if (storedToken) {
    userToken.value = storedToken;
  } else {
    userToken.value = generateToken();
    localStorage.setItem('poker_user_token', userToken.value);
  }

  socket.on('connect', () => {
    socket.emit('restore-session', userToken.value);
  });

  socket.on('session-restored', ({ seatIndex }) => {
    mySeatIndex.value = seatIndex;
    socket.emit('get-my-hand', seatIndex, (data: any) => {
      myHand.value = data.hand;
      mySlots.value = data.slots;
    });
  });

  socket.on('init', (state) => Object.assign(gameState, state));
  
  socket.on('update', (state) => {
    Object.assign(gameState, state);
    if (mySeatIndex.value !== -1) {
      socket.emit('get-my-hand', mySeatIndex.value, (data: any) => {
        myHand.value = data.hand;
        mySlots.value = data.slots;
      });
    }
  });

  socket.on('force-reload', () => {
    window.location.reload();
  });
});

const sit = (index: number) => {
  if (gameState.seats[index]) return;
  socket.emit('sit', { 
    name: myName.value, 
    seatIndex: index,
    token: userToken.value 
  });
  mySeatIndex.value = index;
};

const updateMyName = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (mySeatIndex.value !== -1) {
    socket.emit('update-name', { seatIndex: mySeatIndex.value, name: input.value });
  }
};

const updateBillboard = (e: Event) => {
  const input = e.target as HTMLTextAreaElement;
  socket.emit('update-billboard', input.value);
};

const handleScoreboardNameChange = (e: Event, seatIndex: number) => {
  const input = e.target as HTMLInputElement;
  socket.emit('update-name', { seatIndex, name: input.value });
};

const handleScoreboardScoreChange = (e: Event, seatIndex: number) => {
  const input = e.target as HTMLInputElement;
  socket.emit('update-score', { seatIndex, score: input.value });
};

const confirmScoreChange = (seatIndex: number, currentScore: number) => {
  const inputs = scoreInputs[seatIndex];
  if (!inputs) return;

  const addVal = parseInt(inputs.add) || 0;
  const subVal = parseInt(inputs.sub) || 0;

  if (addVal === 0 && subVal === 0) return;

  const newScore = currentScore + addVal - subVal;
  socket.emit('update-score', { seatIndex, score: newScore });

  inputs.add = '';
  inputs.sub = '';
};

const showHand = () => {
  if (mySeatIndex.value !== -1) {
    socket.emit('show-hand', { seatIndex: mySeatIndex.value });
  }
};

const showSlot = (slotId: number) => {
  if (mySeatIndex.value !== -1) {
    socket.emit('show-slot', { seatIndex: mySeatIndex.value, slotId });
  }
};

const control = (action: string) => socket.emit('control', action);

// --- 新增：判断是否是胜者 ---
const isWinner = (seatIndex: number, slotId: number) => {
  return winningSlots[seatIndex] && winningSlots[seatIndex].includes(slotId);
};

const calculateAllScores = () => {
  const community = gameState.communityCards;
  if (community.length < 3) {
    alert("公共牌不足，无法计算！");
    return;
  }

  // 清空之前的获胜状态
  Object.keys(winningSlots).forEach(key => delete winningSlots[parseInt(key)]);

  // 临时存储所有人的分数： { [slotId]: [ { seatIndex, score } ] }
  const slotScores: { [key: number]: { seatIndex: number, score: number }[] } = {
    1: [], 2: [], 3: []
  };

  // 1. 计算每个人的分数
  gameState.seats.forEach((seat, idx) => {
    if (!seat) return;
    
    const targetSlots = (idx === mySeatIndex.value) ? mySlots.value : seat.slots;
    
    if (!calculatedResults[idx]) calculatedResults[idx] = {};

    for (let i = 1; i <= 3; i++) {
      const slotCards = targetSlots[i] || [];
      const visibleCards = slotCards.filter((c: any) => c.id !== 'hidden');
      
      if (visibleCards.length === 2) {
        const pool = [...community, ...visibleCards];
        const res = calculateHandScore5of7(pool);
        const catName = HandCategoryName[res.category] || '高牌';
        
        // 显示结果
        calculatedResults[idx][i] = `${catName} (${res.score.toString(16).toUpperCase()})`;
        
        // 收集分数用于比较
        const slotScore = slotScores[i];
        if (slotScore) {
          slotScore.push({ seatIndex: idx, score: res.score });
        }
      } else {
        calculatedResults[idx][i] = '';
      }
    }
  });

  // 2. 比较分数，找出每个 Slot 的胜者
  for (let i = 1; i <= 3; i++) {
    const scores = slotScores[i];
    if (!scores || scores.length === 0) continue;

    // 找出最大分
    const maxScore = Math.max(...scores.map(s => s.score));
    
    // 找出所有等于最大分的人
    const winners = scores.filter(s => s.score === maxScore);

    // 标记胜者
    winners.forEach(w => {
      const seatIndex = w.seatIndex;
      let winningSlot = winningSlots[seatIndex];
      if (!winningSlot) {
        winningSlot = [];
        winningSlots[seatIndex] = winningSlot;
      }
      winningSlot.push(i);
    });
  }
};

const handleHardReset = () => {
  const pwd = prompt("【危险操作】请输入管理员密码以重置服务：");
  if (pwd === '2727') {
    socket.emit('control', 'hard-reset');
  } else if (pwd !== null) {
    alert("密码错误！");
  }
};

const clickHandCard = (card: Card) => {
  if (mySeatIndex.value === -1) return;
  let targetSlot = 0;
  for (let i = 1; i <= 3; i++) {
    if ((mySlots.value[i]?.length || 0) < 2) {
      targetSlot = i;
      break;
    }
  }
  if (targetSlot !== 0) {
    socket.emit('move-card', { seatIndex: mySeatIndex.value, cardId: card.id, target: targetSlot });
  } else {
    alert("牌槽已满！请先移除一些牌。");
  }
};

const clickSlotCard = (card: Card) => {
  if (mySeatIndex.value === -1) return;
  socket.emit('move-card', { seatIndex: mySeatIndex.value, cardId: card.id, target: 'hand' });
};

const getSeatStyle = (index: number) => {
  const angleDeg = (index * 60) + 90; 
  const angleRad = angleDeg * Math.PI / 180;
  const rx = 540; 
  const ry = 330; 
  const x = Math.cos(angleRad) * rx;
  const y = Math.sin(angleRad) * ry;
  return { transform: `translate(${x}px, ${y}px)` };
};
</script>

<template>
  <div class="table-container">
    <button class="fixed-reset-btn" @click="handleHardReset">⚠ 重置服务</button>

    <div class="billboard-container">
      <textarea 
        class="billboard-text" 
        :value="gameState.billboard"
        @input="updateBillboard"
        placeholder="在此输入公告..."
      ></textarea>
    </div>

    <div class="scoreboard">
      <h3>积分榜</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 25%">玩家</th>
            <th style="width: 15%">总分 <span class="total-score-sum">({{ totalScore }})</span></th>
            <th style="width: 20%; color: #69f0ae;">变动+</th>
            <th style="width: 20%; color: #ff5252;">变动-</th>
            <th style="width: 20%">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(seat, idx) in gameState.seats" :key="idx">
            <template v-if="seat">
              <td>
                <input class="sb-input sb-name" :value="seat.name" @change="(e) => handleScoreboardNameChange(e, idx)" />
              </td>
              <td>
                <input type="number" class="sb-input sb-score" :value="seat.score" @change="(e) => handleScoreboardScoreChange(e, idx)" />
              </td>
              
              <template v-if="scoreInputs[idx]">
                <td>
                  <input 
                    type="number" 
                    class="sb-input sb-op" 
                    v-model="scoreInputs[idx].add" 
                    placeholder="" 
                    @keyup.enter="confirmScoreChange(idx, seat.score)"
                  />
                </td>
                <td>
                  <input 
                    type="number" 
                    class="sb-input sb-op" 
                    v-model="scoreInputs[idx].sub" 
                    placeholder="" 
                    @keyup.enter="confirmScoreChange(idx, seat.score)"
                  />
                </td>
              </template>
              
              <td>
                <button class="sb-confirm-btn" @click="confirmScoreChange(idx, seat.score)">OK</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="poker-table">
      
      <div class="center-area">
        <div class="board">
          <PokerCard v-for="c in gameState.communityCards" :key="c.id" :card="c" width="56px" />
        </div>
        
        <div class="admin-controls">
          <button @click="control('new-game')">新开局(自动翻牌)</button>
          <button @click="control('deal-turn')">发牌</button>
          <button @click="calculateAllScores" class="calc-btn">算分</button>
        </div>
      </div>

      <div v-for="(seat, index) in gameState.seats" :key="index" 
           class="seat-wrapper" :style="getSeatStyle(index)">
        
        <div v-if="!seat" class="empty-seat" @click="sit(index)">+ 入座</div>
        
        <div v-else class="player-seat" 
             :class="{ 
               'is-me': index === mySeatIndex 
             }">

          <div class="slots-container">
            <div v-for="i in 3" :key="i" class="slot-box" 
                 :class="{ 
                   'showdown-effect': seat.isShowing || (seat.shownSlots && seat.shownSlots.includes(i)),
                   'winner-slot': isWinner(index, i) 
                 }">
              
              <div class="slot-left">
                <div class="slot-multiplier" :style="{ color: multiplierColors[i] }">
                  {{ slotMultipliers[i] }}
                </div>
                
                <div v-if="calculatedResults[index] && calculatedResults[index][i]" class="slot-rank-info">
                  {{ calculatedResults[index][i] }}
                </div>

                <button v-if="index === mySeatIndex && !seat.isShowing && (!seat.shownSlots || !seat.shownSlots.includes(i))" 
                        class="slot-show-btn" 
                        @click.stop="showSlot(i)" 
                        title="亮出此道">
                  👁️
                </button>
              </div>

              <div class="slot-cards">
                <template v-if="index === mySeatIndex">
                   <PokerCard 
                    v-for="c in mySlots[i]" 
                    :key="c.id" 
                    :card="c" 
                    width="35px" 
                    @click="clickSlotCard(c)"
                    style="cursor: pointer;"
                  />
                </template>
                
                <template v-else>
                  <template v-for="(c, k) in (seat.slots[i] || [])" :key="k">
                    <div v-if="c.id === 'hidden'" class="card-back-xs"></div>
                    <PokerCard v-else :card="c" width="35px" />
                  </template>
                </template>
              </div>
            </div>
          </div>

          <div class="info">
            <div class="name-row">
              <input 
                v-if="index === mySeatIndex" 
                class="name-input"
                :value="seat.name" 
                @change="updateMyName"
                placeholder="昵称"
              />
              <div v-else class="name">{{ seat.name }}</div>
            </div>
            
            <div class="player-score">Score: {{ seat.score }}</div>

            <div class="hand" :class="{ 'folded': seat.isFolded }">
              <template v-if="index === mySeatIndex">
                 <PokerCard v-for="c in myHand" 
                            :key="c.id" :card="c" width="45px" 
                            @click="clickHandCard(c)"
                            style="cursor: pointer; transition: transform 0.1s;"
                            class="hover-card" />
              </template>
              <template v-else-if="seat.isShowing && seat.hand">
                 <PokerCard v-for="c in seat.hand" :key="c.id" :card="c" width="45px" />
              </template>
              <template v-else>
                 <div v-for="k in (seat.hand ? seat.hand.length : 0)" :key="k" class="card-back-sm"></div>
              </template>
              
              <div v-if="seat.isFolded" class="fold-overlay">FOLD</div>
            </div>
            
            <div class="action-btns" v-if="index === mySeatIndex">
              <button class="show-btn" @click="showHand" title="全亮">👁️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
body { background: #111; color: white; margin: 0; font-family: sans-serif; overflow: hidden; }
.table-container { height: 100vh; display: flex; justify-content: center; align-items: center; }

.poker-table { 
  width: 1000px; 
  height: 550px; 
  background: #35654d; 
  border-radius: 50%; 
  border: 15px solid #4e342e; 
  position: relative; 
  box-shadow: 0 0 50px rgba(0,0,0,0.5) inset; 
}

.center-area { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 340px; z-index: 5; }
.board { display: flex; justify-content: center; gap: 8px; margin-bottom: 15px; min-height: 80px; }
.admin-controls button { background: #455a64; color: white; border: none; padding: 4px 8px; margin: 2px; border-radius: 4px; cursor: pointer; }
.calc-btn { background: #e65100 !important; font-weight: bold; } /* 算分按钮样式 */

.fixed-reset-btn { position: fixed; top: 15px; left: 15px; z-index: 1000; background: #b71c1c; color: #ffcdd2; border: 1px solid #e53935; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5); transition: all 0.2s; }
.fixed-reset-btn:hover { background: #d32f2f; transform: scale(1.05); }

.billboard-container {
  position: fixed;
  top: 15px;
  left: 150px; 
  z-index: 900;
}
.billboard-text {
  background: transparent;
  border: 2px dashed rgba(255, 215, 0, 0.3);
  color: #ffd700;
  font-size: 1.5em; 
  font-weight: bold;
  width: 400px;
  height: 100px;
  resize: both;
  padding: 10px;
  font-family: "Microsoft YaHei", sans-serif;
  text-shadow: 2px 2px 0 #000;
  overflow: hidden;
}
.billboard-text:focus {
  outline: none;
  border-color: rgba(255, 215, 0, 0.8);
  background: rgba(0,0,0,0.2);
}

.scoreboard {
  position: fixed;
  top: 15px;
  right: 15px;
  background: rgba(0, 0, 0, 0.85);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #555;
  z-index: 1000;
  min-width: 320px; 
  box-shadow: 0 5px 15px rgba(0,0,0,0.5);
}
.scoreboard h3 { margin: 0 0 10px 0; font-size: 1em; color: #ffd700; text-align: center; border-bottom: 1px solid #444; padding-bottom: 5px; }
.scoreboard table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.scoreboard th { text-align: center; color: #aaa; padding-bottom: 5px; font-weight: normal; }
.scoreboard td { padding: 4px 2px; }

.total-score-sum { font-size: 0.8em; color: #aaa; font-weight: normal; }

.sb-input::-webkit-outer-spin-button,
.sb-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.sb-input[type=number] {
  -moz-appearance: textfield;
}

.sb-input {
  background: #222;
  border: 1px solid #444;
  color: #ddd;
  padding: 3px 5px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 0.9em;
  transition: border-color 0.2s;
  text-align: center;
}
.sb-input:focus { outline: none; border-color: #2196f3; background: #333; }
.sb-name { width: 100%; box-sizing: border-box; text-align: left; }
.sb-score { width: 40px; font-weight: bold; color: #fff; }
.sb-op { width: 40px; } 

.sb-confirm-btn {
  background: #2e7d32;
  color: white;
  border: none;
  border-radius: 3px;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 0.8em;
}
.sb-confirm-btn:hover { background: #43a047; }

.seat-wrapper { position: absolute; top: 50%; left: 50%; width: 160px; height: 340px; margin-left: -80px; margin-top: -170px; display: flex; justify-content: center; align-items: center; pointer-events: none; }
.seat-wrapper > * { pointer-events: auto; }
.empty-seat { width: 60px; height: 60px; border-radius: 50%; border: 2px dashed #666; display: flex; justify-content: center; align-items: center; cursor: pointer; color: #888; }
.player-seat { display: flex; flex-direction: column; align-items: center; position: relative; width: 100%; height: 100%; justify-content: space-between; }



.info { display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 20; text-shadow: 0 0 5px black; }
.hand { display: flex; gap: 4px; margin-top: 2px; height: 65px; align-items: center; position: relative; }

.card-back-sm { width: 45px; height: 62px; background: #3b4a8c; border: 2px solid white; border-radius: 4px; }
.card-back-xs { width: 35px; height: 48px; background: #3b4a8c; border: 2px solid white; border-radius: 3px; }

.folded { filter: grayscale(100%); opacity: 0.6; }
.fold-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: #ff5252; font-weight: 900; font-size: 1.2em; text-shadow: 1px 1px 0 black; transform: rotate(-15deg); pointer-events: none; }

.name-row { display: flex; align-items: center; justify-content: center; height: 24px; }
.name-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; width: 80px; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; text-align: center; }
.name-input:focus { background: rgba(0,0,0,0.8); outline: none; border-color: #ffd700; }
.player-score { font-size: 0.8em; color: #4fc3f7; font-weight: bold; }

.action-btns { display: flex; gap: 5px; margin-top: 5px; }
.show-btn { background: #1976d2; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
.show-btn:hover { background: #2196f3; transform: scale(1.1); }

.slots-container {
  display: flex; 
  flex-direction: column; 
  gap: 2px; 
  margin-bottom: 5px; 
  background: rgba(0,0,0,0.2); 
  padding: 4px; 
  border-radius: 6px;
  transition: all 0.3s;
  width: 100%; 
  align-items: center;
}
.slot-box {
  display: flex; 
  flex-direction: row; 
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: transparent; 
  border: none;
  border-radius: 4px; 
  padding: 1px;
  width: 100%;
  min-height: 45px; 
}
.slot-left {
  display: flex;
  align-items: center;
  gap: 5px; 
  width: 50px; 
  justify-content: flex-end;
}
.slot-multiplier {
  font-size: 0.8em;
  font-weight: 900;
  text-shadow: 1px 1px 0 black;
  margin-right: 2px;
}
.slot-rank-info {
  font-size: 0.7em;
  color: #00e676;
  white-space: nowrap;
  margin-right: 5px;
  text-shadow: 1px 1px 0 black;
}

.slot-show-btn {
  background: none; border: none; cursor: pointer; font-size: 10px; padding: 0; opacity: 0.7;
}
.slot-show-btn:hover { opacity: 1; transform: scale(1.2); }

.slot-cards { display: flex; gap: 2px; justify-content: center; }
.hover-card:hover { transform: translateY(-5px) !important; filter: brightness(1.1); }

.showdown-effect {
  box-shadow: 0 0 15px #2196f3;
  border: 1px solid #64b5f6;
  animation: pulse 1.5s infinite;
  background: rgba(33, 150, 243, 0.1);
}

.winner-slot {
  /* 1. 边框：实心，加粗，深金色，不再变化 */
  border: 2px solid #ffd700 !important;
  /* 2. 背景：使用渐变背景，模拟金属质感 */
  /* 从左上到右下：透明 -> 亮金(反光) -> 透明 */
  background: linear-gradient(
    120deg, 
    rgba(255, 215, 0, 0.1) 30%, 
    rgba(255, 255, 255, 0.4) 50%, 
    rgba(255, 215, 0, 0.1) 70%
  ) !important;
  /* 拉大背景尺寸，以便让它动起来 */
  background-size: 200% 100% !important;
  /* 3. 阴影：多层叠加，制造“浮起”和“发光”的立体感，但不闪烁 */
  box-shadow: 
    0 0 0 1px #b8860b, /* 最内圈深色描边，增加锐度 */
    0 0 15px rgba(255, 215, 0, 0.6), /* 中圈金色光晕 */
    inset 0 0 20px rgba(255, 215, 0, 0.2) /* 内发光，照亮内部牌 */
    !important;
  /* 4. 动画：只移动背景位置，产生扫光效果 */
  animation: shine-sweep 3s linear infinite;
}

@keyframes shine-sweep {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes pulse {
  0% { box-shadow: 0 0 10px #2196f3; }
  50% { box-shadow: 0 0 20px #64b5f6; }
  100% { box-shadow: 0 0 10px #2196f3; }
}
</style>
