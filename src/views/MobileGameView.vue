<script setup lang="ts">
import { computed } from 'vue';
import PokerCard from '../components/PokerCard.vue';
import type { SlotSettlementResult } from '../utils/pokerScoring';

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
  slots: Record<number, Card[]>;
  shownSlots: number[];
  isFolded: boolean;
  isShowing: boolean;
  isReady: boolean;
  isDone: boolean;
  isAway: boolean;
}

interface GameState {
  seats: (Player | null)[];
  communityCards: Card[];
  billboard: string;
  phase?: string;
  isSettled?: boolean;
}

interface MoveLatencyStats {
  count: number;
  pendingMoveId: number | null;
  lastMoveId: number | null;
  lastRoundTripMs: number;
  avgRoundTripMs: number;
  maxRoundTripMs: number;
  lastAckMs: number;
  lastServerMs: number;
  lastRenderMs: number;
}

const props = defineProps<{
  gameState: GameState;
  roomId: string;
  mySeatIndex: number;
  myName: string;
  myHand: Card[];
  mySlots: Record<number, Card[]>;
  isReady: boolean;
  calculatedResults: Record<number, Record<number, string>>;
  winningSlots: Record<number, number[]>;
  settlementResults: SlotSettlementResult[];
  totalDeltaSum: number;
  totalScore: number;
  slotMultipliers: Record<number, string>;
  multiplierColors: Record<number, string>;
  checkAllSlotsFilled: () => boolean;
  sit: (index: number) => void;
  updateMyName: (event: Event) => void;
  clickHandCard: (card: Card) => void;
  clickSlotCard: (card: Card) => void;
  toggleReady: () => void;
  toggleAway: () => void;
  control: (action: string) => void;
  calculateAllScores: () => void;
  resetGame: () => void;
  copyRoomId: () => void;
  moveLatencyStats: MoveLatencyStats;
}>();

const seatedPlayers = computed(() => props.gameState.seats.filter(Boolean).length);
const isShowdown = computed(() => props.gameState.phase?.startsWith('SHOWDOWN') || props.settlementResults.length > 0);
const isArranging = computed(() => props.gameState.phase === 'PLAYING');
const isInRound = computed(() => isArranging.value || isShowdown.value);
const mySeat = computed(() => props.mySeatIndex >= 0 ? props.gameState.seats[props.mySeatIndex] : null);
const firstEmptySeatIndex = computed(() => props.gameState.seats.findIndex((seat) => !seat));
const canFillAi = computed(() => Boolean(mySeat.value) && firstEmptySeatIndex.value !== -1 && !isArranging.value);
const primaryActionActive = computed(() => isArranging.value ? Boolean(mySeat.value?.isDone) : Boolean(mySeat.value?.isReady));
const primaryActionLabel = computed(() => {
  if (isArranging.value) return mySeat.value?.isDone ? '已放好' : '牌放好了 done';
  return mySeat.value?.isReady ? '已准备' : '准备下一局 ready';
});
const primaryActionDisabled = computed(() => {
  if (!mySeat.value) return true;
  if (isShowdown.value && !props.gameState.isSettled) return true;
  if (!isArranging.value) return false;
  return !mySeat.value.isDone && !props.checkAllSlotsFilled();
});
const showdownStatusLabel = computed(() => {
  if (props.gameState.phase === 'SHOWDOWN_REVEAL') return '亮牌中';
  if (props.gameState.phase === 'SHOWDOWN_TURN') return '发第四张';
  if (props.gameState.phase === 'SHOWDOWN_RIVER') return '咪最后一张';
  if (props.gameState.phase === 'SHOWDOWN_SETTLED') return '已结算';
  return 'SHOWDOWN';
});
const seatStatusLabel = (seat: Player) => {
  if (seat.isAway) return '暂离';
  if (isArranging.value) return seat.isDone ? 'Done' : '摆牌';
  return seat.isReady ? 'Ready' : '等待';
};
const resultPlayers = computed(() => {
  return props.gameState.seats
    .map((seat, seatIndex) => ({ seat, seatIndex }))
    .filter((entry): entry is { seat: Player; seatIndex: number } => Boolean(entry.seat));
});

const findSettlement = (seatIndex: number) => {
  return props.settlementResults.find((result) => result.seatIndex === seatIndex);
};

const isWinner = (seatIndex: number, slotId: number) => {
  return props.winningSlots[seatIndex]?.includes(slotId) ?? false;
};

const slotDelta = (settlement: SlotSettlementResult | undefined, slotId: number) => {
  if (!settlement) return 0;
  if (slotId === 1) return settlement.slot1Delta;
  if (slotId === 2) return settlement.slot2Delta;
  return settlement.slot3Delta;
};

const slotResultLabel = (seatIndex: number, slotId: number) => {
  return props.calculatedResults[seatIndex]?.[slotId]?.split(' ')[0] || '未计算';
};

const formatDelta = (value: number) => {
  if (value > 0) return `+${value}`;
  return String(value);
};

const getMySlotCard = (slotId: number, cellIndex: number) => {
  return props.mySlots[slotId]?.[cellIndex - 1];
};

const clickMySlotCell = (slotId: number, cellIndex: number) => {
  const card = getMySlotCard(slotId, cellIndex);
  if (card) props.clickSlotCard(card);
};
</script>

<template>
  <main class="mobile-game-shell" data-testid="mobile-game-view">
    <header class="mobile-topbar">
      <div>
        <div class="mobile-title">Pineapple</div>
        <div class="mobile-subtitle">{{ seatedPlayers }}/6 入座 · 总分 {{ totalScore }}</div>
      </div>
      <button type="button" class="room-chip" data-testid="room-id-chip" @click="copyRoomId">
        房间 {{ roomId }}
      </button>
      <details class="top-menu" data-testid="mobile-top-menu">
        <summary aria-label="更多操作">...</summary>
        <div class="top-menu-content">
          <div class="latency-panel" data-testid="move-latency-panel">
            <span>move {{ moveLatencyStats.lastRoundTripMs }}ms</span>
            <span>avg {{ moveLatencyStats.avgRoundTripMs }} / max {{ moveLatencyStats.maxRoundTripMs }}</span>
            <span>ack {{ moveLatencyStats.lastAckMs }} · srv {{ moveLatencyStats.lastServerMs }} · ui {{ moveLatencyStats.lastRenderMs }}</span>
          </div>
          <button type="button" @click="resetGame">重置游戏</button>
          <button type="button" disabled>教程</button>
        </div>
      </details>
    </header>

    <section class="seat-strip" :class="{ compact: isInRound }" aria-label="座位">
      <button
        v-for="(seat, index) in gameState.seats"
        :key="index"
        type="button"
        class="seat-pill"
        :class="{ occupied: seat, mine: index === mySeatIndex, ready: !isArranging && seat?.isReady, done: isArranging && seat?.isDone, away: seat?.isAway }"
        :aria-label="seat ? `${seat.name} ${seat.score} ${seatStatusLabel(seat)}` : `座位${index + 1} 入座`"
        @click="!seat && sit(index)"
      >
        <span class="seat-name">{{ seat ? seat.name : `座位${index + 1}` }}</span>
        <span class="seat-meta">
          <template v-if="seat">
            <template v-if="isInRound">{{ seat.score }}</template>
            <template v-else>{{ seat.score }} · {{ seatStatusLabel(seat) }}</template>
          </template>
          <template v-else>入座</template>
        </span>
      </button>
    </section>

    <section v-if="!isShowdown" class="board-panel">
      <div class="panel-heading">
        <span>公共牌</span>
        <span>{{ gameState.phase || 'PREFLOP' }}</span>
      </div>
      <div class="mobile-board">
        <PokerCard v-for="card in gameState.communityCards" :key="card.id" :card="card" width="42px" />
        <div v-for="index in Math.max(0, 5 - gameState.communityCards.length)" :key="`empty-${index}`" class="mobile-card-hole"></div>
      </div>
    </section>

    <section v-if="isArranging && mySeat" class="my-panel">
      <div class="my-header">
        <input class="mobile-name-input" :value="mySeat.name" @change="updateMyName" />
        <span class="my-score">Score {{ mySeat.score }}</span>
      </div>

      <div class="mobile-slots">
        <div
          v-for="slotId in [1, 2, 3]"
          :key="slotId"
          class="mobile-slot-row"
          :class="{ winner: isWinner(mySeatIndex, slotId) }"
        >
          <div class="slot-label">
            <strong :style="{ color: multiplierColors[slotId] }">{{ slotMultipliers[slotId] }}</strong>
            <span>{{ calculatedResults[mySeatIndex]?.[slotId] || '待摆牌' }}</span>
          </div>
          <div class="slot-card-cells">
            <button
              v-for="cellIndex in 2"
              :key="cellIndex"
              type="button"
              class="slot-cell"
              @click="clickMySlotCell(slotId, cellIndex)"
            >
              <PokerCard
                v-if="getMySlotCard(slotId, cellIndex)"
                :card="getMySlotCard(slotId, cellIndex)"
                width="46px"
              />
            </button>
          </div>
        </div>
      </div>

      <div class="mobile-actions">
        <button type="button" class="secondary-action" @click="toggleAway">{{ mySeat.isAway ? '回归' : '暂离' }}</button>
        <button
          type="button"
          class="primary-action"
          :class="{ ready: primaryActionActive }"
          :disabled="primaryActionDisabled"
          @click="toggleReady"
        >
          {{ primaryActionLabel }}
        </button>
      </div>

      <div class="hand-rail" aria-label="手牌">
        <button
          v-for="card in myHand"
          :key="card.id"
          type="button"
          class="hand-card-btn"
          @click="clickHandCard(card)"
        >
          <PokerCard :card="card" width="42px" />
        </button>
      </div>
    </section>

    <section v-else-if="!mySeat && firstEmptySeatIndex !== -1" class="join-panel">
      <p>点一个空座入座，准备后开始下一局。</p>
      <button type="button" class="primary-action" @click="sit(firstEmptySeatIndex)">一键入座</button>
    </section>

    <section v-if="!isArranging && !isShowdown && mySeat" class="round-ready-panel">
      <div>
        <strong>{{ mySeat.name }}</strong>
        <span>Score {{ mySeat.score }}</span>
      </div>
      <button
        type="button"
        class="primary-action"
        :class="{ ready: primaryActionActive }"
        :disabled="primaryActionDisabled"
        @click="toggleReady"
      >
        {{ primaryActionLabel }}
      </button>
    </section>

    <section v-if="isShowdown" class="results-panel" data-testid="showdown-results">
      <div class="panel-heading">
        <span>摊牌结果</span>
        <span>{{ showdownStatusLabel }}</span>
        <span v-if="totalDeltaSum !== 0">Delta {{ totalDeltaSum }}</span>
      </div>

      <div class="result-public-board" data-testid="result-public-board">
        <div
          v-for="(card, index) in gameState.communityCards"
          :key="`result-${card.id}`"
          class="result-public-card"
          :class="{ 'river-peek': gameState.phase === 'SHOWDOWN_RIVER' && index === gameState.communityCards.length - 1 }"
          :data-testid="gameState.phase === 'SHOWDOWN_RIVER' && index === gameState.communityCards.length - 1 ? 'river-peek-card' : undefined"
        >
          <PokerCard :card="card" width="28px" />
        </div>
      </div>

      <div class="result-grid compact-showdown-grid">
        <article
          v-for="{ seat, seatIndex } in resultPlayers"
          :key="seatIndex"
          class="result-player-card"
          :class="{ mine: seatIndex === mySeatIndex }"
          :data-testid="seatIndex === mySeatIndex ? 'result-player-mine' : undefined"
        >
          <div class="result-player-head">
            <strong>
              {{ seat.name }}
              <span v-if="seatIndex === mySeatIndex" class="mine-badge">我</span>
            </strong>
            <span :class="{ positive: (findSettlement(seatIndex)?.totalDelta || 0) > 0, negative: (findSettlement(seatIndex)?.totalDelta || 0) < 0 }">
              {{ formatDelta(findSettlement(seatIndex)?.totalDelta || 0) }}
            </span>
          </div>

          <div
            v-for="slotId in [1, 2, 3]"
            :key="slotId"
            class="result-slot"
            :class="{ winner: isWinner(seatIndex, slotId) }"
          >
            <div class="result-slot-label">
              <strong :style="{ color: multiplierColors[slotId] }">{{ slotMultipliers[slotId] }}</strong>
              <span>{{ slotResultLabel(seatIndex, slotId) }}</span>
              <em>{{ formatDelta(slotDelta(findSettlement(seatIndex), slotId)) }}</em>
            </div>
            <div class="result-cards compact-result-cards">
              <template v-for="(card, cardIndex) in (seat.slots[slotId] || [])" :key="`${slotId}-${cardIndex}`">
                <div v-if="card.id === 'hidden'" class="mobile-card-back"></div>
                <PokerCard v-else :card="card" width="16px" />
              </template>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="isShowdown && mySeat" class="showdown-bottom-actions">
      <button
        type="button"
        class="primary-action showdown-ready-action"
        :class="{ ready: primaryActionActive }"
        :disabled="primaryActionDisabled"
        data-testid="showdown-bottom-ready"
        @click="toggleReady"
      >
        {{ primaryActionLabel }}
      </button>
    </section>

    <section v-if="!isArranging && !isShowdown" class="admin-mobile-panel">
      <button type="button" :disabled="!canFillAi" @click="control('fill-ai')">加满AI</button>
      <details class="debug-menu">
        <summary aria-label="更多调试操作">...</summary>
        <div class="debug-menu-content">
          <button type="button" @click="control('new-game')">调试发牌</button>
          <button type="button" @click="calculateAllScores">手动算分</button>
        </div>
      </details>
    </section>
  </main>
</template>

<style scoped>
.mobile-game-shell {
  box-sizing: border-box;
  width: 100%;
  min-height: 100dvh;
  max-height: 100dvh;
  overflow-y: auto;
  padding: max(10px, env(safe-area-inset-top)) 10px max(14px, env(safe-area-inset-bottom));
  background: #14382f;
  color: #f7fbf8;
  display: flex;
  flex-direction: column;
  gap: 6px;
  touch-action: manipulation;
  -webkit-text-size-adjust: 100%;
  -webkit-user-select: none;
  user-select: none;
}

.mobile-game-shell button,
.mobile-game-shell summary,
.mobile-game-shell .card-placeholder {
  touch-action: manipulation;
}

.mobile-topbar,
.board-panel,
.my-panel,
.join-panel,
.round-ready-panel,
.admin-mobile-panel,
.showdown-bottom-actions,
.results-panel,
.result-player-card {
  background: rgba(8, 22, 19, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
}

.mobile-topbar {
  min-height: 40px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mobile-title {
  font-size: 16px;
  font-weight: 800;
}

.mobile-subtitle {
  color: #b9ccc6;
  font-size: 12px;
}

.room-chip {
  border: 0;
  border-radius: 7px;
  background: #f8d56b;
  color: #17342d;
  font-size: 12px;
  font-weight: 900;
  min-height: 34px;
  padding: 0 10px;
  white-space: nowrap;
}

.icon-text-btn,
.admin-mobile-panel button,
.top-menu button,
.secondary-action,
.primary-action {
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: #244b40;
  min-height: 38px;
  padding: 0 12px;
}

.top-menu {
  position: relative;
  flex: 0 0 auto;
}

.top-menu summary {
  list-style: none;
  cursor: pointer;
  width: 38px;
  height: 34px;
  border-radius: 7px;
  background: #244b40;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
}

.top-menu summary::-webkit-details-marker {
  display: none;
}

.top-menu-content {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 4;
  width: 188px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(8, 22, 19, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.14);
  display: grid;
  gap: 6px;
}

.top-menu button:disabled {
  opacity: 0.45;
}

.latency-panel {
  color: #b9ccc6;
  display: grid;
  gap: 2px;
  font-size: 10px;
  line-height: 1.2;
  padding: 2px 2px 4px;
}

.seat-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.seat-strip.compact {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  overflow: visible;
}

.seat-pill {
  border: 1px dashed rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #edf7f4;
  min-height: 48px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.seat-strip.compact .seat-pill {
  min-width: 0;
  min-height: 24px;
  padding: 2px 6px;
  border-radius: 6px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.seat-strip.compact .seat-name {
  max-width: 72px;
  font-size: 11px;
  line-height: 1;
}

.seat-strip.compact .seat-meta {
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.seat-pill.occupied {
  border-style: solid;
  background: rgba(35, 74, 64, 0.88);
}

.seat-pill.mine {
  border-color: #f8d56b;
}

.seat-pill.ready,
.seat-pill.done {
  box-shadow: inset 0 -3px 0 #50c878;
}

.seat-pill.away {
  opacity: 0.62;
}

.seat-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}

.seat-meta {
  color: #b9ccc6;
  font-size: 11px;
}

.board-panel,
.my-panel,
.join-panel,
.round-ready-panel,
.results-panel {
  padding: 10px;
}

.panel-heading,
.my-header,
.round-ready-panel,
.result-player-head,
.result-slot-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-heading {
  color: #dbe9e4;
  font-size: 12px;
  margin-bottom: 8px;
}

.mobile-board {
  min-height: 58px;
  display: flex;
  justify-content: center;
  gap: 5px;
}

.mobile-card-hole,
.mobile-card-back {
  width: 42px;
  height: 58px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.06);
}

.mobile-card-back {
  width: 25px;
  height: 35px;
  border-style: solid;
  background: #314b85;
}

.my-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-name-input {
  width: min(52vw, 220px);
  height: 36px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  padding: 0 10px;
  font-size: 16px;
}

.my-score {
  color: #9bdcff;
  font-weight: 700;
}

.mobile-slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-slot-row {
  min-height: 70px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  padding: 7px;
  display: grid;
  grid-template-columns: minmax(88px, 1fr) 108px;
  gap: 8px;
  align-items: center;
}

.mobile-slot-row.winner,
.result-slot.winner {
  border-color: #f8d56b;
  background: rgba(248, 213, 107, 0.16);
}

.slot-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.slot-label strong {
  font-size: 18px;
}

.slot-label span {
  color: #b9ccc6;
  font-size: 12px;
  overflow-wrap: anywhere;
  text-align: left;
}

.slot-card-cells {
  display: grid;
  grid-template-columns: repeat(2, 52px);
  gap: 4px;
}

.slot-cell,
.hand-card-btn {
  border: 0;
  padding: 0;
  background: transparent;
}

.slot-cell {
  width: 52px;
  height: 64px;
  border-radius: 7px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
}

.mobile-actions {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 7px;
}

.primary-action {
  background: #d08a20;
  color: #18130a;
  font-weight: 900;
}

.primary-action.ready {
  background: #50c878;
}

.primary-action:disabled {
  opacity: 0.45;
}

.secondary-action {
  background: #244b40;
}

.showdown-bottom-actions {
  padding: 8px;
}

.showdown-ready-action {
  width: 100%;
  min-height: 46px;
  font-size: 18px;
}

.hand-rail {
  min-height: 62px;
  overflow-x: auto;
  display: flex;
  gap: 6px;
  padding-bottom: 4px;
}

.hand-card-btn {
  flex: 0 0 auto;
}

.join-panel {
  text-align: center;
}

.join-panel p {
  color: #dbe9e4;
  margin: 0 0 10px;
}

.admin-mobile-panel {
  padding: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 8px;
}

.admin-mobile-panel button:disabled {
  opacity: 0.45;
}

.debug-menu {
  position: relative;
}

.debug-menu summary {
  list-style: none;
  cursor: pointer;
  min-height: 38px;
  border-radius: 7px;
  background: #244b40;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
}

.debug-menu summary::-webkit-details-marker {
  display: none;
}

.debug-menu-content {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 3;
  width: 128px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(8, 22, 19, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.14);
  display: grid;
  gap: 6px;
}

.results-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
}

.result-public-board {
  min-height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.result-public-card {
  display: inline-flex;
}

.result-public-card.river-peek {
  animation: river-peek-reveal 900ms ease-out both;
  transform-origin: bottom center;
}

@keyframes river-peek-reveal {
  0% {
    opacity: 0.18;
    transform: translateY(14px) rotate(-3deg) scale(0.9);
    clip-path: inset(0 0 72% 0 round 6px);
  }
  55% {
    opacity: 0.86;
    transform: translateY(5px) rotate(1deg) scale(0.98);
    clip-path: inset(0 0 26% 0 round 6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotate(0) scale(1);
    clip-path: inset(0 0 0 0 round 6px);
  }
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.result-player-card {
  padding: 5px;
  min-width: 0;
}

.result-player-card.mine {
  border-color: #f8d56b;
  box-shadow: inset 0 0 0 1px rgba(248, 213, 107, 0.45);
  background: rgba(38, 52, 30, 0.92);
}

.result-player-head {
  margin-bottom: 4px;
  font-size: 12px;
}

.result-player-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mine-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f8d56b;
  color: #18241e;
  font-size: 11px;
  font-weight: 900;
}

.positive {
  color: #69f0ae;
}

.negative {
  color: #ff8a80;
}

.result-slot {
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px 4px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
  gap: 3px;
  min-height: 34px;
}

.result-slot + .result-slot {
  margin-top: 3px;
}

.result-slot-label {
  min-width: 0;
  justify-content: flex-start;
  gap: 3px;
}

.result-slot-label strong,
.result-slot-label em {
  flex: 0 0 auto;
}

.result-slot-label strong {
  font-size: 14px;
}

.result-slot-label span {
  color: #dbe9e4;
  font-size: 10px;
  white-space: nowrap;
}

.result-slot-label em {
  margin-left: auto;
  font-style: normal;
  font-weight: 800;
  font-size: 12px;
}

.result-cards {
  display: flex;
  justify-content: flex-end;
  gap: 1px;
}

.compact-result-cards {
  display: flex;
}
</style>
