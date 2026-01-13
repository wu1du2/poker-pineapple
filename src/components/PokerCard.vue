<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ card?: { suit: string, rank: string, color: string }, width?: string }>();

const cardStyle = computed(() => {
  const wVal = parseFloat(props.width || '40');
  return {
    width: `${wVal}px`,
    height: `${wVal * 1.4}px`, 
    fontSize: `${wVal * 0.5}px` 
  };
});
</script>

<template>
  <div class="card" :class="[card?.color, { 'back': !card }]" :style="cardStyle">
    <template v-if="card">
      <div class="content-wrapper">
        <div class="rank">{{ card.rank }}</div>
        <div class="suit">{{ card.suit }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card { 
  background: white; 
  border-radius: 4px; 
  position: relative;
  flex-shrink: 0;
  flex-grow: 0;
  box-sizing: border-box;
  border: 1px solid #888; 
  box-shadow: none !important; 
  font-family: 'Arial Black', 'Helvetica Neue', sans-serif; 
  user-select: none;
  overflow: hidden;
}
.content-wrapper {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  line-height: 0.85;
}
.red { color: #d32f2f; } 
.black { color: #000; }
.rank { font-weight: 900; letter-spacing: -1px; }
.suit { font-size: 0.7em; margin-top: -2px; }
.back { background: #3949ab; border: 3px solid white; outline: 1px solid #888; }
</style>
