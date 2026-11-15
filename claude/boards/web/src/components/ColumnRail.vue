<script setup lang="ts">
import { computed } from 'vue';
import { look } from '@/columns';
import { laneState } from '@/drag';

// A column shown as a narrow rail, as the design shows Done: its count and
// name, and a click expands it to a lane. A dragged card drops on it under
// the same column rules as on a lane.
const props = defineProps<{ column: string; count: number; loading?: boolean }>();
const emit = defineEmits<{ open: [] }>();
const state = computed(() => laneState(props.column));
</script>

<template>
  <button
    type="button"
    :data-column="column"
    :aria-label="`Show ${column}, ${count} cards`"
    class="flex cursor-pointer flex-col items-center gap-2.5 rounded-[10px] border py-3.5 transition-opacity"
    :class="[state === 'locked' ? 'opacity-40' : '', state === 'over' ? 'border-cd-accent' : 'border-transparent']"
    :style="{ background: look(column).soft, color: look(column).ink }"
    @click="emit('open')"
  >
    <svg v-if="column === 'Draft'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke-dasharray="2 2" /></svg>
    <span v-else-if="column !== 'Done' && column !== 'Released'" class="flex size-4 items-center justify-center"><span class="size-2 rounded-full" :style="{ background: look(column).dot }" /></span>
    <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M5.5 8.2l1.7 1.7 3.3-3.6" /></svg>
    <span v-if="loading" class="h-2.5 w-3 rounded opacity-25" :style="{ background: look(column).ink }" />
    <span v-else class="font-mono text-xs font-semibold">{{ count }}</span>
    <span class="text-[13px] font-semibold [writing-mode:vertical-rl]">{{ column }}</span>
  </button>
</template>
