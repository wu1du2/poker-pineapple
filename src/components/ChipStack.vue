<script setup lang="ts">
defineProps<{ value: number, count: number, clickable?: boolean }>();
const emit = defineEmits(['click-chip', 'exchange']);

const handleClick = () => emit('click-chip');
const handleRightClick = (e: Event) => {
  e.preventDefault();
  emit('exchange', e);
};

const getColor = (v: number) => {
  if (v === 1) return '#fff';
  if (v === 5) return '#f44336';
  if (v === 25) return '#4caf50';
  if (v === 100) return '#212121';
  return '#ccc';
};
</script>

<template>
  <div class="stack-container" 
       :class="{ 'clickable': clickable }"
       @click="clickable && count > 0 ? handleClick() : null"
       @contextmenu="clickable ? handleRightClick($event) : null">
    
    <div v-for="i in Math.min(count, 10)" :key="i" 
         class="chip" 
         :style="{ 
           backgroundColor: getColor(value),
           bottom: `${(i-1)*4}px`,
           color: value === 100 ? 'white' : 'black',
           border: value === 1 ? '1px solid #ccc' : '2px dashed white'
         }">
      {{ value }}
    </div>
    <div v-if="count > 10" class="count-badge">{{ count }}</div>
  </div>
</template>

<style scoped>
.stack-container { width: 32px; height: 50px; position: relative; margin: 0 2px; }
.clickable { cursor: pointer; }
.clickable:hover .chip { filter: brightness(1.1); }
.chip {
  width: 30px; height: 30px; border-radius: 50%;
  position: absolute; left: 0;
  display: flex; justify-content: center; align-items: center;
  font-size: 10px; font-weight: bold;
  box-shadow: 0 2px 2px rgba(0,0,0,0.3);
  user-select: none;
}
.count-badge {
  position: absolute; top: -10px; right: -5px;
  background: rgba(0,0,0,0.7); color: white;
  font-size: 10px; padding: 2px 4px; border-radius: 4px;
  z-index: 20;
}
</style>
