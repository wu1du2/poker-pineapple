<script setup lang="ts">
import { computed, ref } from 'vue';
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
  isSurrendered?: boolean;
  surrenderCooldown?: number;
}

interface ScoreboardEntry {
  id: string;
  name: string;
  score: number;
  isBot: boolean;
  isSeated: boolean;
  seatIndex: number | null;
}

interface GameState {
  seats: (Player | null)[];
  scoreboard?: ScoreboardEntry[];
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

interface TutorialPage {
  title: string;
  body: string[];
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
  renameDisplayName: (name: string) => void;
  kickSeat: (seatIndex: number) => void;
  clickHandCard: (card: Card) => void;
  clickSlotCard: (card: Card) => void;
  toggleReady: () => void;
  surrender: () => void;
  control: (action: string) => void;
  calculateAllScores: () => void;
  resetGame: () => void;
  copyRoomId: () => void;
  moveLatencyStats: MoveLatencyStats;
}>();

const tutorialPages: TutorialPage[] = [
  {
    title: '放好六张牌',
    body: [
      '你会拿到 7 张手牌。',
      '从中选 6 张，分别放进 3 组牌：',
      '5倍区：2 张',
      '3倍区：2 张',
      '1倍区：2 张',
      '剩下 1 张不用。',
      '三组都放满后，点击“牌放好了 done”。'
    ]
  },
  {
    title: '七选五比大小',
    body: [
      '每组 2 张牌，会和 5 张公共牌合成 7 张。',
      '系统会自动从这 7 张里选出最大的 5 张牌。',
      '例子：你的这一组是 A♠ 9♠。',
      '公共牌是 K♠ 7♠ 3♠ A♥ 2♣。',
      '这 7 张里可以选出 A♠ K♠ 9♠ 7♠ 3♠，所以这一组是“同花”。',
      '牌型从大到小：皇家同花顺 > 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌。'
    ]
  },
  {
    title: '田忌赛马，冲高倍 or 保底',
    body: [
      '三组牌倍率不同：5倍区最重要，3倍区其次，1倍区保底。',
      '你可以把最强的 2 张放进 5倍区冲高分。',
      '也可以把牌分散，保证至少赢一组。',
      '关键不是每组都强，而是让强牌赢在更值钱的位置。'
    ]
  },
  {
    title: '小心别通输',
    body: [
      '如果三组牌都没赢，算作通输。',
      '通输会有额外扣分。',
      '至少赢过一组的玩家，会分到额外加分。',
      '结算页总分旁边的括号，就是通输/通赢调整。',
      '例如：+96 (+20)、-39 (-20)。'
    ]
  }
];

const isTutorialOpen = ref(false);
const tutorialPageIndex = ref(0);
const topMenu = ref<HTMLDetailsElement | null>(null);
const menuPanel = ref<'main' | 'scoreboard' | 'kick'>('main');
const tutorialPage = computed<TutorialPage>(() => tutorialPages[tutorialPageIndex.value] || tutorialPages[0] as TutorialPage);

const closeTopMenu = () => {
  menuPanel.value = 'main';
  if (topMenu.value) topMenu.value.open = false;
};

const handleTopMenuToggle = () => {
  if (!topMenu.value?.open) menuPanel.value = 'main';
};

const openTutorial = () => {
  closeTopMenu();
  tutorialPageIndex.value = 0;
  isTutorialOpen.value = true;
};

const closeTutorial = () => {
  isTutorialOpen.value = false;
};

const previousTutorialPage = () => {
  tutorialPageIndex.value = Math.max(0, tutorialPageIndex.value - 1);
};

const nextTutorialPage = () => {
  tutorialPageIndex.value = Math.min(tutorialPages.length - 1, tutorialPageIndex.value + 1);
};

const promptRename = () => {
  const currentName = mySeat.value?.name || props.myName;
  const nextName = window.prompt('输入新的显示名字', currentName);
  if (nextName !== null) props.renameDisplayName(nextName);
};

const seatedPlayers = computed(() => props.gameState.seats.filter(Boolean).length);
const seatedEntries = computed(() => {
  return props.gameState.seats
    .map((seat, seatIndex) => ({ seat, seatIndex }))
    .filter((entry): entry is { seat: Player; seatIndex: number } => Boolean(entry.seat));
});
const sortedScoreboard = computed(() => {
  return [...(props.gameState.scoreboard || [])]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
});
const isShowdown = computed(() => props.gameState.phase?.startsWith('SHOWDOWN') || props.settlementResults.length > 0);
const isArranging = computed(() => props.gameState.phase === 'PLAYING');
const isInRound = computed(() => isArranging.value || isShowdown.value);
const mySeat = computed(() => props.mySeatIndex >= 0 ? props.gameState.seats[props.mySeatIndex] : null);
const firstEmptySeatIndex = computed(() => props.gameState.seats.findIndex((seat) => !seat));
const canFillAi = computed(() => Boolean(mySeat.value) && firstEmptySeatIndex.value !== -1 && !isArranging.value);
const primaryActionActive = computed(() => isArranging.value ? Boolean(mySeat.value?.isDone) : Boolean(mySeat.value?.isReady));
const primaryActionLabel = computed(() => {
  if (isArranging.value && mySeat.value?.isSurrendered) return '已认输';
  if (isArranging.value) return mySeat.value?.isDone ? '已放好' : '牌放好了 done';
  return mySeat.value?.isReady ? '已准备' : '准备下一局 ready';
});
const primaryActionDisabled = computed(() => {
  if (!mySeat.value) return true;
  if (isShowdown.value && !props.gameState.isSettled) return true;
  if (!isArranging.value) return false;
  if (mySeat.value.isSurrendered) return true;
  return !mySeat.value.isDone && !props.checkAllSlotsFilled();
});
const surrenderActionLabel = computed(() => {
  const cooldown = mySeat.value?.surrenderCooldown || 0;
  if (cooldown > 0) return `${cooldown}回合后可用`;
  if (mySeat.value?.isSurrendered) return '已认输';
  return '认输';
});
const surrenderActionDisabled = computed(() => Boolean(mySeat.value?.isSurrendered || (mySeat.value?.surrenderCooldown || 0) > 0));
const showdownStatusLabel = computed(() => {
  if (props.gameState.phase === 'SHOWDOWN_REVEAL') return '亮牌中';
  if (props.gameState.phase === 'SHOWDOWN_TURN') return '发第四张';
  if (props.gameState.phase === 'SHOWDOWN_RIVER') return '咪最后一张';
  if (props.gameState.phase === 'SHOWDOWN_SETTLED') return '已结算';
  return 'SHOWDOWN';
});
const seatStatusLabel = (seat: Player) => {
  if (seat.isAway) return '暂离';
  if (seat.isSurrendered) return '认输';
  if (isArranging.value) return seat.isDone ? 'Done' : '摆牌';
  return seat.isReady ? 'Ready' : '等待';
};
const resultPlayers = computed(() => {
  return seatedEntries.value;
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

const handTypeTierClass = (label: string) => {
  if (label === '同花顺' || label === '皇家同花顺') return 'type-tier-legendary';
  if (label === '四条') return 'type-tier-premium';
  if (['葫芦', '同花', '顺子'].includes(label)) return 'type-tier-made';
  if (label === '三条') return 'type-tier-trips';
  if (label === '高牌') return 'type-tier-low';
  return 'type-tier-pair';
};

const formatDelta = (value: number) => {
  if (value > 0) return `+${value}`;
  return String(value);
};

const formatTotalDelta = (settlement: SlotSettlementResult | undefined) => {
  if (!settlement) return '0';
  const total = formatDelta(settlement.totalDelta);
  if (!settlement.totalLoserDelta) return total;
  return `${total} (${formatDelta(settlement.totalLoserDelta)})`;
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
      <details ref="topMenu" class="top-menu" data-testid="mobile-top-menu" @toggle="handleTopMenuToggle">
        <summary aria-label="更多操作">...</summary>
        <div class="top-menu-content">
          <div v-if="menuPanel === 'main'" class="menu-panel">
            <div class="latency-panel" data-testid="move-latency-panel">
              <span>move {{ moveLatencyStats.lastRoundTripMs }}ms</span>
              <span>avg {{ moveLatencyStats.avgRoundTripMs }} / max {{ moveLatencyStats.maxRoundTripMs }}</span>
              <span>ack {{ moveLatencyStats.lastAckMs }} · srv {{ moveLatencyStats.lastServerMs }} · ui {{ moveLatencyStats.lastRenderMs }}</span>
            </div>
            <button type="button" @click="resetGame">重置游戏</button>
            <button type="button" @click="promptRename">修改名字</button>
            <button type="button" @click="openTutorial">教程</button>
            <button type="button" @click="menuPanel = 'scoreboard'">积分榜</button>
            <button type="button" @click="menuPanel = 'kick'">踢人</button>
          </div>
          <div v-else-if="menuPanel === 'scoreboard'" class="menu-panel" data-testid="scoreboard-menu">
            <div class="menu-subheader">
              <strong>积分榜</strong>
              <button type="button" @click="menuPanel = 'main'">返回</button>
            </div>
            <div class="scoreboard-menu">
              <div v-if="sortedScoreboard.length === 0" class="scoreboard-empty">暂无分数</div>
              <div v-for="entry in sortedScoreboard" :key="entry.id" class="scoreboard-row" :class="{ seated: entry.isSeated }">
                <span class="scoreboard-name">{{ entry.name }}</span>
                <span class="scoreboard-seat">{{ entry.isSeated && entry.seatIndex !== null ? `座位${entry.seatIndex + 1}` : '离座' }}</span>
                <strong>{{ entry.score }}</strong>
              </div>
            </div>
          </div>
          <div v-else class="menu-panel" data-testid="kick-menu">
            <div class="menu-subheader">
              <strong>踢人</strong>
              <button type="button" @click="menuPanel = 'main'">返回</button>
            </div>
            <div class="kick-menu">
              <div v-if="seatedEntries.length === 0" class="kick-empty">暂无玩家</div>
              <div v-for="{ seat, seatIndex } in seatedEntries" :key="seatIndex" class="kick-row">
                <span>{{ seat.name }} · 座位{{ seatIndex + 1 }}</span>
                <button type="button" :aria-label="`踢出 ${seat.name}`" @click="kickSeat(seatIndex)">踢出</button>
              </div>
            </div>
          </div>
        </div>
      </details>
    </header>

    <div v-if="isTutorialOpen" class="tutorial-overlay" data-testid="tutorial-dialog">
      <section class="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-header">
          <span>{{ tutorialPageIndex + 1 }}/{{ tutorialPages.length }}</span>
          <h2 id="tutorial-title" data-testid="tutorial-title">{{ tutorialPage.title }}</h2>
        </div>
        <div class="tutorial-body" data-testid="tutorial-body">
          <p v-for="line in tutorialPage.body" :key="line">{{ line }}</p>
        </div>
        <div class="tutorial-actions">
          <button type="button" @click="closeTutorial">返回</button>
          <button type="button" :disabled="tutorialPageIndex === 0" @click="previousTutorialPage">上一页</button>
          <button type="button" :disabled="tutorialPageIndex === tutorialPages.length - 1" @click="nextTutorialPage">下一页</button>
        </div>
      </section>
    </div>

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
        <button
          type="button"
          class="secondary-action surrender-action"
          :disabled="surrenderActionDisabled"
          @click="surrender"
        >
          {{ surrenderActionLabel }}
        </button>
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
            <span
              class="result-total-delta"
              :class="{ positive: (findSettlement(seatIndex)?.totalDelta || 0) > 0, negative: (findSettlement(seatIndex)?.totalDelta || 0) < 0 }"
            >
              {{ formatTotalDelta(findSettlement(seatIndex)) }}
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
              <span :class="handTypeTierClass(slotResultLabel(seatIndex, slotId))">{{ slotResultLabel(seatIndex, slotId) }}</span>
              <em>{{ formatDelta(slotDelta(findSettlement(seatIndex), slotId)) }}</em>
            </div>
            <div class="result-cards compact-result-cards">
              <template v-for="(card, cardIndex) in (seat.slots[slotId] || [])" :key="`${slotId}-${cardIndex}`">
                <div v-if="card.id === 'hidden'" class="mobile-card-back"></div>
                <PokerCard v-else :card="card" width="34px" />
              </template>
            </div>
          </div>
        </article>
      </div>

      <button
        v-if="mySeat"
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
  width: 236px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(8, 22, 19, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.14);
  display: grid;
  gap: 6px;
  max-height: calc(100dvh - 132px);
  overflow-y: auto;
}

.top-menu button:disabled {
  opacity: 0.45;
}

.menu-panel {
  display: grid;
  gap: 6px;
}

.menu-subheader {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: #edf7f4;
  font-size: 14px;
}

.menu-subheader button {
  min-height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 900;
}

.scoreboard-menu,
.kick-menu {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 6px;
  display: grid;
  gap: 5px;
}

.scoreboard-menu-title,
.scoreboard-empty,
.kick-menu-title,
.kick-empty {
  color: #b9ccc6;
  font-size: 11px;
  font-weight: 800;
}

.scoreboard-empty,
.kick-empty {
  font-weight: 600;
}

.scoreboard-row {
  min-height: 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  color: rgba(237, 247, 244, 0.68);
  font-size: 12px;
}

.scoreboard-row.seated {
  color: #edf7f4;
}

.scoreboard-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scoreboard-seat {
  color: #b9ccc6;
  font-size: 10px;
}

.scoreboard-row strong {
  min-width: 28px;
  text-align: right;
  color: #f8d56b;
}

.kick-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: #edf7f4;
  font-size: 12px;
}

.kick-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kick-row button {
  min-height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  background: #69302f;
  font-size: 12px;
  font-weight: 900;
}

.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(3, 10, 8, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.tutorial-panel {
  width: min(100%, 360px);
  max-height: calc(100dvh - 36px);
  border-radius: 8px;
  background: #0b201b;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.38);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tutorial-header {
  display: grid;
  gap: 4px;
}

.tutorial-header span {
  color: #f8d56b;
  font-size: 12px;
  font-weight: 900;
}

.tutorial-header h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.15;
  letter-spacing: 0;
}

.tutorial-body {
  display: grid;
  gap: 7px;
  color: #e6f0ec;
  font-size: 14px;
  line-height: 1.35;
}

.tutorial-body p {
  margin: 0;
}

.tutorial-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tutorial-actions button {
  border: 0;
  border-radius: 7px;
  min-height: 38px;
  background: #244b40;
  color: #fff;
  font-weight: 900;
}

.tutorial-actions button:disabled {
  opacity: 0.4;
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
  gap: 4px;
  padding: 6px;
}

.result-public-board {
  min-height: 30px;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.result-player-card {
  padding: 4px 3px;
  min-width: 0;
}

.result-player-card.mine {
  border-color: #f8d56b;
  box-shadow: inset 0 0 0 1px rgba(248, 213, 107, 0.45);
  background: rgba(38, 52, 30, 0.92);
}

.result-player-head {
  margin-bottom: 2px;
  font-size: 10px;
  line-height: 1.1;
}

.result-player-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-total-delta {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 9px;
  letter-spacing: 0;
}

.mine-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f8d56b;
  color: #18241e;
  font-size: 10px;
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
  padding: 2px 3px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  align-items: center;
  gap: 2px;
  min-height: 39px;
}

.result-slot + .result-slot {
  margin-top: 2px;
}

.result-slot-label {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 2px;
  line-height: 1;
}

.result-slot-label strong,
.result-slot-label em {
  flex: 0 0 auto;
}

.result-slot-label strong {
  font-size: 10px;
}

.result-slot-label span {
  color: #dbe9e4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 24px;
  font-size: 9px;
  line-height: 1;
  white-space: nowrap;
  font-weight: 800;
}

.result-slot-label span.type-tier-legendary {
  color: #f8d56b;
  text-shadow: 0 0 5px rgba(248, 213, 107, 0.42);
}

.result-slot-label span.type-tier-premium {
  color: #d6a8ff;
  text-shadow: 0 0 5px rgba(214, 168, 255, 0.32);
}

.result-slot-label span.type-tier-made {
  color: #8ecaff;
}

.result-slot-label span.type-tier-trips {
  color: #69f0ae;
}

.result-slot-label span.type-tier-pair {
  color: #f1f6f4;
}

.result-slot-label span.type-tier-low {
  color: #94aaa3;
}

.result-slot-label em {
  margin-left: 0;
  font-style: normal;
  font-weight: 800;
  font-size: 10px;
}

.result-cards {
  display: flex;
  justify-content: flex-end;
  gap: 1px;
}

.compact-result-cards {
  display: flex;
}

.compact-result-cards :deep(.card-placeholder) {
  transform: scale(0.68);
  transform-origin: right center;
  margin-left: -11px;
}

.showdown-ready-action {
  min-height: 34px;
  width: 100%;
  font-size: 14px;
}
</style>
