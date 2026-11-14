<script setup lang="ts">
import { computed } from 'vue';
import type { CardSummary } from '@/api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { drag, pressCard } from '@/drag';

const props = defineProps<{ card: CardSummary; selected?: boolean; large?: boolean }>();
const emit = defineEmits<{ open: [id: string] }>();

const pct = computed(() => (props.card.criteria.total ? Math.round((100 * props.card.criteria.ticked) / props.card.criteria.total) : 0));
const finished = computed(() => props.card.column === 'Done' || props.card.column === 'Released');
const lifted = computed(() => drag.started && drag.card?.id === props.card.id);
</script>

<template>
  <article
    :data-card-id="card.id"
    class="flex cursor-pointer touch-none flex-col gap-2.5 rounded-[10px] border bg-cd-surface select-none"
    :class="[large ? 'p-3.5' : 'p-3', lifted ? 'border-dashed border-cd-selected opacity-35' : 'border-cd-hairline']"
    :style="{ outline: selected ? '2px solid var(--cd-accent)' : 'none', outlineOffset: '-1px' }"
    @pointerdown="pressCard($event, card)"
    @click="emit('open', card.id)"
  >
    <div class="flex items-center gap-1.5">
      <span class="font-mono text-cd-ink-muted" :class="large ? 'text-xs' : 'text-[11px]'">{{ card.id }}</span>
      <span v-if="finished" class="ml-auto font-semibold text-cd-logbook" :class="large ? 'text-xs' : 'text-[11px]'">{{ card.column }}</span>
    </div>
    <h3 class="m-0 font-medium" :class="[large ? 'text-sm leading-5' : 'text-[13px] leading-[18px]', finished ? 'text-cd-ink-muted' : '']">{{ card.title }}</h3>
    <div class="flex items-center gap-2">
      <Progress :model-value="pct" aria-label="Acceptance criteria" class="flex-1" />
      <span class="font-mono text-cd-ink-muted" :class="large ? 'text-xs' : 'text-[11px]'">{{ card.criteria.ticked }}/{{ card.criteria.total }}</span>
    </div>
    <div v-if="card.actions.length" class="flex flex-col gap-2 rounded-[10px] bg-cd-today-soft" :class="large ? 'p-3' : 'p-2.5'">
      <div class="flex items-center gap-1.5 font-semibold text-cd-today-ink" :class="large ? 'text-xs' : 'text-[11px]'">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--cd-today)" aria-hidden="true"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" /></svg>
        {{ card.actions.length > 1 ? `${card.actions.length} actions for you` : 'Action for you' }}
      </div>
      <p class="m-0" :class="large ? 'text-[13px] leading-[18px]' : 'text-xs leading-[17px]'">{{ card.actions[0] }}</p>
      <Button size="sm" variant="outline" class="self-start" @click.stop="emit('open', card.id)">Answer</Button>
    </div>
  </article>
</template>
