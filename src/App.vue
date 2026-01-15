<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { io } from 'socket.io-client';
import PokerCard from './components/PokerCard.vue';

const socket = io(); 

const myName = ref('Player' + Math.floor(Math.random()*100));
const mySeatIndex = ref(-1);
const myHand = ref<any[]>([]);
const mySlots = ref<{ [key: number]: any[] }>({ 1: [], 2: [], 3: [] });

// 临时存储积分榜的输入状态：双列输入
const scoreInputs = reactive(Array.from({ length: 6 }, () => ({ add: '', sub: '' })));

// Slot 倍率配置
const slotMultipliers: { [key: number]: string } = { 1: '5倍', 2: '3倍', 3: '1倍' };
// 倍率颜色配置
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
  dealerIndex: number;
  billboard: string;
}

const gameState = reactive<GameState>({
  seats: new Array(6).fill(null),
  communityCards: [],
  dealerIndex: -1,
  billboard: ''
});

onMounted(() => {
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
  socket.emit('sit', { name: myName.value, seatIndex: index });
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

// --- 修复：双列积分计算逻辑 ---
const confirmScoreChange = (seatIndex: number, currentScore: number) => {
  const inputs = scoreInputs[seatIndex];
  if (!inputs) return;

  const addVal = parseInt(inputs.add) || 0;
  const subVal = parseInt(inputs.sub) || 0;

  if (addVal === 0 && subVal === 0) return;

  const newScore = currentScore + addVal - subVal;
  socket.emit('update-score', { seatIndex, score: newScore });

  // 清空输入框
  inputs.add = '';
  inputs.sub = '';
};

const fold = () => {
  if (mySeatIndex.value !== -1) {
    socket.emit('fold', { seatIndex: mySeatIndex.value });
  }
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

    <!-- 积分榜：双列输入 + 回车确认 -->
    <div class="scoreboard">
      <h3>积分榜</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 25%">玩家</th>
            <th style="width: 15%">总分</th>
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
                  <!-- 加分输入框，支持回车 -->
                  <input 
                    type="number" 
                    class="sb-input sb-op" 
                    v-model="scoreInputs[idx].add" 
                    placeholder="" 
                    @keyup.enter="confirmScoreChange(idx, seat.score)"
                  />
                </td>
                <td>
                  <!-- 减分输入框，支持回车 -->
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
          <button @click="control('deal-turn')">转牌</button>
          <button @click="control('deal-river')">河牌</button>
        </div>
      </div>

      <div v-for="(seat, index) in gameState.seats" :key="index" 
           class="seat-wrapper" :style="getSeatStyle(index)">
        
        <div v-if="!seat" class="empty-seat" @click="sit(index)">+ 入座</div>
        
        <div v-else class="player-seat" 
             :class="{ 
               'is-me': index === mySeatIndex, 
               'is-dealer': gameState.dealerIndex === index 
             }">

          <div class="slots-container">
            <div v-for="i in 3" :key="i" class="slot-box" 
                 :class="{ 'showdown-effect': seat.isShowing || (seat.shownSlots && seat.shownSlots.includes(i)) }">
              
              <div class="slot-left">
                <div class="slot-multiplier" :style="{ color: multiplierColors[i] }">
                  {{ slotMultipliers[i] }}
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
              <span v-if="gameState.dealerIndex === index" class="d-btn">D</span>
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
              <button class="fold-btn" @click="fold" title="弃牌">✕</button>
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

.is-dealer { border: 3px solid #ffd700; border-radius: 12px; box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); background-color: rgba(0, 0, 0, 0.2); padding: 5px; margin: -5px; }

.info { display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 20; text-shadow: 0 0 5px black; }
.hand { display: flex; gap: 4px; margin-top: 2px; height: 65px; align-items: center; position: relative; }

.card-back-sm { width: 45px; height: 62px; background: #3b4a8c; border: 2px solid white; border-radius: 4px; }
.card-back-xs { width: 35px; height: 48px; background: #3b4a8c; border: 2px solid white; border-radius: 3px; }

.folded { filter: grayscale(100%); opacity: 0.6; }
.fold-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: #ff5252; font-weight: 900; font-size: 1.2em; text-shadow: 1px 1px 0 black; transform: rotate(-15deg); pointer-events: none; }
.d-btn { background: white; color: black; border-radius: 50%; width: 20px; height: 20px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 0.8em; margin-right: 5px; box-shadow: 0 0 5px white; }
.name-row { display: flex; align-items: center; justify-content: center; height: 24px; }
.name-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; width: 80px; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; text-align: center; }
.name-input:focus { background: rgba(0,0,0,0.8); outline: none; border-color: #ffd700; }
.player-score { font-size: 0.8em; color: #4fc3f7; font-weight: bold; }

.action-btns { display: flex; gap: 5px; margin-top: 5px; }
.fold-btn { background: #c62828; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
.fold-btn:hover { background: #e53935; transform: scale(1.1); }
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
@keyframes pulse {
  0% { box-shadow: 0 0 10px #2196f3; }
  50% { box-shadow: 0 0 20px #64b5f6; }
  100% { box-shadow: 0 0 10px #2196f3; }
}
</style>
