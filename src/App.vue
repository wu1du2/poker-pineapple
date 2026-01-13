<script setup lang="ts">
import { reactive, ref, onMounted, computed } from 'vue';
import { io } from 'socket.io-client';
import ChipStack from './components/ChipStack.vue';
import PokerCard from './components/PokerCard.vue';

const socket = io(); 

const myName = ref('Player' + Math.floor(Math.random()*100));
const mySeatIndex = ref(-1);
const myHand = ref<any[]>([]);
const mySlots = ref<{ [key: number]: any[] }>({ 1: [], 2: [], 3: [] });

// --- 修复：将属性改为必填，以满足 PokerCard 组件的类型要求 ---
// 虽然 hidden 牌实际上没有这些属性，但我们在模板中通过 v-if 避开了渲染，所以这里可以安全地“撒谎”
interface Card {
  suit: string;
  rank: string;
  color: string;
  id: string;
}

interface Player {
  id: string;
  name: string;
  stack: Record<number, number>;
  betArea: Record<number, number>;
  hand: Card[] | null;
  slots: { [key: number]: Card[] }; 
  shownSlots: number[];
  isFolded: boolean;
  isShowing: boolean;
  buyInCount: number;
}

interface GameState {
  seats: (Player | null)[];
  pot: Record<number, number>;
  communityCards: Card[];
  dealerIndex: number;
}

const gameState = reactive<GameState>({
  seats: new Array(9).fill(null),
  pot: { 1: 0, 5: 0, 25: 0, 100: 0 },
  communityCards: [],
  dealerIndex: -1
});

const myStack = computed(() => {
  if (mySeatIndex.value === -1 || !gameState.seats[mySeatIndex.value]) return {};
  return gameState.seats[mySeatIndex.value]!.stack;
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

const handleChip = (action: string, value: number, seatIdx: number) => {
  if (seatIdx !== mySeatIndex.value) return;
  socket.emit('chip-action', { action, value, seatIndex: seatIdx });
};

const handleSmartExchange = (val: number) => {
  const stack = myStack.value;
  const count = stack[val] || 0;
  let type = '';
  if (val === 100) type = 'SPLIT_100';
  else if (val === 25) type = (count >= 4) ? 'MERGE_25' : 'SPLIT_25';
  else if (val === 5) type = (count >= 5) ? 'MERGE_5' : 'SPLIT_5';
  else if (val === 1) type = (count >= 5) ? 'MERGE_1' : '';
  if (type) socket.emit('exchange', { seatIndex: mySeatIndex.value, type });
};

const doExchange = (type: string) => {
  if (mySeatIndex.value !== -1) {
    socket.emit('exchange', { seatIndex: mySeatIndex.value, type });
  }
};

const updateName = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (mySeatIndex.value !== -1) {
    socket.emit('update-name', { seatIndex: mySeatIndex.value, name: input.value });
  }
};

const buyIn = () => {
  if (mySeatIndex.value !== -1) {
    socket.emit('buy-in', { seatIndex: mySeatIndex.value });
  }
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

const takePot = (seatIdx: number) => {
  socket.emit('chip-action', { action: 'TAKE_POT', seatIndex: seatIdx });
};

const control = (action: string) => socket.emit('control', action);
const collectPot = () => socket.emit('collect-pot');

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
  const angle = (index * 40) + 90; 
  const radius = 340; 
  const x = Math.cos(angle * Math.PI / 180) * radius;
  const y = Math.sin(angle * Math.PI / 180) * radius;
  return { transform: `translate(${x}px, ${y}px)` };
};
</script>

<template>
  <div class="table-container">
    <button class="fixed-reset-btn" @click="handleHardReset">⚠ 重置服务</button>

    <div class="poker-table">
      
      <div class="center-area">
        <div class="board">
          <PokerCard v-for="c in gameState.communityCards" :key="c.id" :card="c" width="38px" />
        </div>
        
        <div class="pot-area">
          <div class="pot-label">Pot</div>
          <div class="pot-chips">
            <ChipStack v-for="v in [1, 5, 25, 100]" :key="v" :value="v" :count="gameState.pot[v] || 0" />
          </div>
          <button class="dealer-btn" @click="collectPot">收筹码入池</button>
        </div>

        <div class="admin-controls">
          <button @click="control('new-game')">新开局</button>
          <button @click="control('deal-flop')">翻牌</button>
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
          <button class="win-btn" @click="takePot(index)">收底池</button>

          <!-- 1. 牌槽区域 -->
          <div class="slots-container">
            <div v-for="i in 3" :key="i" class="slot-box" 
                 :class="{ 'showdown-effect': seat.isShowing || (seat.shownSlots && seat.shownSlots.includes(i)) }">
              
              <div class="slot-left">
                <div class="slot-label">{{ i }}</div>
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
                    width="25px" 
                    @click="clickSlotCard(c)"
                    style="cursor: pointer;"
                  />
                </template>
                
                <template v-else>
                  <template v-for="(c, k) in (seat.slots[i] || [])" :key="k">
                    <!-- 关键：这里通过 v-if 确保了只有真实牌才会传给 PokerCard -->
                    <div v-if="c.id === 'hidden'" class="card-back-xs"></div>
                    <PokerCard v-else :card="c" width="25px" />
                  </template>
                </template>
              </div>
            </div>
          </div>

          <div class="chip-zone bet-zone">
            <ChipStack v-for="v in [1, 5, 25, 100]" :key="v" :value="v" 
                       :count="seat.betArea[v] || 0" 
                       :clickable="index === mySeatIndex"
                       @click-chip="handleChip('RETRIEVE', v, index)" />
          </div>

          <div class="info">
            <div class="name-row">
              <span v-if="gameState.dealerIndex === index" class="d-btn">D</span>
              <input 
                v-if="index === mySeatIndex" 
                class="name-input"
                :value="seat.name" 
                @change="updateName"
                placeholder="昵称"
              />
              <div v-else class="name">{{ seat.name }}</div>
            </div>
            
            <div class="buyin-count">Buyin: {{ seat.buyInCount }}</div>

            <div class="hand" :class="{ 'folded': seat.isFolded }">
              <template v-if="index === mySeatIndex">
                 <PokerCard v-for="c in myHand" 
                            :key="c.id" :card="c" width="32px" 
                            @click="clickHandCard(c)"
                            style="cursor: pointer; transition: transform 0.1s;"
                            class="hover-card" />
              </template>
              <template v-else-if="seat.isShowing && seat.hand">
                 <PokerCard v-for="c in seat.hand" :key="c.id" :card="c" width="32px" />
              </template>
              <template v-else>
                 <div v-for="k in (seat.hand ? seat.hand.length : 0)" :key="k" class="card-back-sm"></div>
              </template>
              
              <div v-if="seat.isFolded" class="fold-overlay">FOLD</div>
            </div>
          </div>

          <div class="chip-zone stack-zone">
            <div class="action-btns" v-if="index === mySeatIndex">
              <button class="buyin-btn" @click="buyIn" title="买入">+💰</button>
              <button class="fold-btn" @click="fold" title="弃牌">✕</button>
              <button class="show-btn" @click="showHand" title="全亮">👁️</button>
            </div>

            <ChipStack v-for="v in [1, 5, 25, 100]" :key="v" :value="v" 
                       :count="seat.stack[v] || 0" 
                       :clickable="index === mySeatIndex"
                       @click-chip="handleChip('BET', v, index)"
                       @exchange="handleSmartExchange" />
          </div>
        </div>
      </div>
    </div>

    <div class="exchange-panel" v-if="mySeatIndex !== -1">
      <div class="panel-title">快速兑换</div>
      <div class="exchange-row">
        <button @click="doExchange('SPLIT_100')" :disabled="(myStack[100] || 0) < 1">100 ➡ 25x4</button>
        <button @click="doExchange('MERGE_25')"  :disabled="(myStack[25] || 0) < 4">25x4 ➡ 100</button>
      </div>
      <div class="exchange-row">
        <button @click="doExchange('SPLIT_25')" :disabled="(myStack[25] || 0) < 1">25 ➡ 5x5</button>
        <button @click="doExchange('MERGE_5')"  :disabled="(myStack[5] || 0) < 5">5x5 ➡ 25</button>
      </div>
      <div class="exchange-row">
        <button @click="doExchange('SPLIT_5')" :disabled="(myStack[5] || 0) < 1">5 ➡ 1x5</button>
        <button @click="doExchange('MERGE_1')" :disabled="(myStack[1] || 0) < 5">1x5 ➡ 5</button>
      </div>
    </div>
  </div>
</template>

<style>
body { background: #111; color: white; margin: 0; font-family: sans-serif; overflow: hidden; }
.table-container { height: 100vh; display: flex; justify-content: center; align-items: center; }
.poker-table { width: 700px; height: 700px; background: #35654d; border-radius: 50%; border: 15px solid #4e342e; position: relative; }
.center-area { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 340px; z-index: 5; }
.board { display: flex; justify-content: center; gap: 8px; margin-bottom: 15px; min-height: 80px; }
.pot-area { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 10px; margin-bottom: 10px; }
.pot-chips { display: flex; justify-content: center; gap: 5px; min-height: 50px; }
.pot-label { font-size: 0.8em; color: #aaa; margin-bottom: 5px; }
.dealer-btn { background: #fbc02d; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 0.8em; }
.admin-controls button { background: #455a64; color: white; border: none; padding: 4px 8px; margin: 2px; border-radius: 4px; cursor: pointer; }

.fixed-reset-btn { position: fixed; top: 15px; left: 15px; z-index: 1000; background: #b71c1c; color: #ffcdd2; border: 1px solid #e53935; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5); transition: all 0.2s; }
.fixed-reset-btn:hover { background: #d32f2f; transform: scale(1.05); }

.seat-wrapper { position: absolute; top: 50%; left: 50%; width: 160px; height: 340px; margin-left: -80px; margin-top: -170px; display: flex; justify-content: center; align-items: center; pointer-events: none; }
.seat-wrapper > * { pointer-events: auto; }
.empty-seat { width: 60px; height: 60px; border-radius: 50%; border: 2px dashed #666; display: flex; justify-content: center; align-items: center; cursor: pointer; color: #888; }
.player-seat { display: flex; flex-direction: column; align-items: center; position: relative; width: 100%; height: 100%; justify-content: space-between; }

.is-dealer { border: 3px solid #ffd700; border-radius: 12px; box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); background-color: rgba(0, 0, 0, 0.2); padding: 5px; margin: -5px; }

.bet-zone { width: 100%; height: 60px; display: flex; justify-content: center; align-items: flex-end; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; }
.info { display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 20; text-shadow: 0 0 5px black; }
.stack-zone { width: 100%; height: 70px; background: rgba(0,0,0,0.4); border-radius: 10px; display: flex; justify-content: center; align-items: flex-end; padding-bottom: 5px; position: relative; }
.hand { display: flex; gap: 4px; margin-top: 2px; height: 65px; align-items: center; position: relative; }
.card-back-sm { width: 28px; height: 39px; background: #3b4a8c; border: 2px solid white; border-radius: 3px; }
.card-back-xs { width: 25px; height: 35px; background: #3b4a8c; border: 1px solid white; border-radius: 2px; }

.folded { filter: grayscale(100%); opacity: 0.6; }
.fold-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: #ff5252; font-weight: 900; font-size: 1.2em; text-shadow: 1px 1px 0 black; transform: rotate(-15deg); pointer-events: none; }
.d-btn { background: white; color: black; border-radius: 50%; width: 20px; height: 20px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 0.8em; margin-right: 5px; box-shadow: 0 0 5px white; }
.win-btn { position: absolute; top: 0; background: #43a047; color: white; border: none; padding: 2px 8px; border-radius: 10px; cursor: pointer; font-size: 0.7em; display: none; z-index: 30; }
.player-seat:hover .win-btn { display: block; }
.is-me .stack-zone { border: 1px solid #ffd700; }
.name-row { display: flex; align-items: center; justify-content: center; height: 24px; }
.name-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; width: 80px; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; text-align: center; }
.name-input:focus { background: rgba(0,0,0,0.8); outline: none; border-color: #ffd700; }
.buyin-count { font-size: 0.7em; color: #aaa; }
.action-btns { display: flex; flex-direction: column; gap: 5px; margin-right: 5px; margin-bottom: 5px; }
.buyin-btn { background: #2e7d32; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
.buyin-btn:hover { background: #43a047; transform: scale(1.1); }
.buyin-btn:active { transform: scale(0.9); }
.fold-btn { background: #c62828; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
.fold-btn:hover { background: #e53935; transform: scale(1.1); }
.fold-btn:active { transform: scale(0.9); }
.show-btn { background: #1976d2; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 12px; cursor: pointer; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
.show-btn:hover { background: #2196f3; transform: scale(1.1); }
.show-btn:active { transform: scale(0.9); }
.exchange-panel { position: fixed; bottom: 20px; left: 20px; background: rgba(0, 0, 0, 0.8); padding: 15px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; gap: 8px; z-index: 100; }
.panel-title { font-size: 0.8em; color: #888; margin-bottom: 5px; text-align: center; }
.exchange-row { display: flex; gap: 10px; }
.exchange-panel button { background: #424242; color: #fff; border: 1px solid #616161; padding: 5px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer; flex: 1; min-width: 90px; }
.exchange-panel button:hover:not(:disabled) { background: #616161; }
.exchange-panel button:active:not(:disabled) { transform: translateY(1px); }
.exchange-panel button:disabled { opacity: 0.3; cursor: not-allowed; }
.hand .card, .board .card { box-shadow: none !important; -webkit-box-shadow: none !important; }
.card .rank, .card .suit { text-shadow: none !important; }

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
  min-height: 35px;
}
.slot-left {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 25px; 
  justify-content: flex-end;
}
.slot-label { font-size: 0.7em; color: #aaa; margin-bottom: 0; font-weight: bold; }
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
