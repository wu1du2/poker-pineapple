<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ card?: { suit: string, rank: string, color: string }, width?: string }>();

// 基准宽度 56px，对应内部字号 40px
const BASE_WIDTH = 56; 

const scale = computed(() => {
  if (!props.width) return 1;
  const target = parseFloat(props.width);
  return target / BASE_WIDTH;
});

const placeholderStyle = computed(() => {
  const w = parseFloat(props.width || '56');
  return {
    width: `${w}px`,
    height: `${w / 0.72}px`
  };
});

const styleClass = computed(() => {
  if (!props.card) return '';
  switch (props.card.suit) {
    case '♠': return 'spade';
    case '♥': return 'heart';
    case '♣': return 'club';
    case '♦': return 'diamond';
    default: return '';
  }
});
</script>

<template>
  <div class="card-placeholder" :style="placeholderStyle">
    <div class="card-content" :class="styleClass" :style="{ transform: `scale(${scale})` }">
      <template v-if="card">
        <div class="rank">{{ card.rank }}</div>
        <div class="suit">{{ card.suit }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.card-placeholder {
  position: relative;
  display: inline-block;
}

.card-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 56px;  /* 基准宽度 */
  height: 78px; /* 56 / 0.72 */
  transform-origin: top left;
  
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: white; 
  box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
  user-select: none;
  line-height: 0.9;
  font-weight: 900;
  border: 1px solid rgba(0,0,0,0.15);
  
  /* 核心需求：字号 40px */
  font-size: 40px; 
}

/* --- 四色牌组配色方案 --- */
.spade { background-color: #e0e0e0; color: #000000; border-color: #9e9e9e; }
.heart { background-color: #ffcdd2; color: #b71c1c; border-color: #ef9a9a; }
.club { background-color: #c8e6c9; color: #1b5e20; border-color: #a5d6a7; }
.diamond { background-color: #bbdefb; color: #0d47a1; border-color: #90caf9; }

.rank { font-size: 0.6em; margin-bottom: -4px; letter-spacing: -2px; }
.suit { font-size: 0.6em; }
</style>
