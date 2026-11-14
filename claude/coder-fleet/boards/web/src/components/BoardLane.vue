<script setup lang="ts">
import { ChevronsRightLeftIcon, LockIcon } from '@lucide/vue';
import { computed } from 'vue';
import type { CardSummary } from '@/api';
import { look } from '@/columns';
import { drag, laneState, target } from '@/drag';
import CardTile from './CardTile.vue';

const props = defineProps<{
  column: string;
  cards: CardSummary[];
  selected?: string | null;
  large?: boolean;
  loading?: number[];
  hint?: boolean;
}>();
const emit = defineEmits<{ open: [id: string]; collapse: [] }>();

const state = computed(() => laneState(props.column));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
// The reason the column rules give, without the card's id and column.
const reason = computed(() => {
  const why = target(props.column)?.refused ?? '';
  const short = why.replace(/^\S+ stays in [^:]+: /, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
});
// In Next, the card the dropped one would go above; none puts it at the foot.
const beforeId = computed(() => (props.column === 'Next' ? props.cards.filter((c) => c.id !== drag.card?.id)[drag.index]?.id : undefined));
const dropNote = computed(() => {
  if (props.column === 'Next') return `${ordinal(drag.index + 1)} in Next`;
  const gate = target(props.column)?.gate;
  return gate ? `It bypasses the ${gate} gate` : `Into ${props.column}`;
});
</script>

<template>
  <section
    :data-column="column"
    class="flex min-h-0 flex-col gap-2.5 rounded-[10px] border transition-opacity"
    :class="[large ? 'p-3' : 'p-2.5', state === 'over' ? 'border-cd-accent bg-cd-accent-soft' : 'border-transparent bg-cd-rail', state === 'locked' ? 'opacity-45' : '']"
  >
    <div class="flex items-center gap-2 px-1 py-0.5">
      <span class="size-2 rounded-full" :style="{ background: look(column).dot }" />
      <h2 class="m-0 font-semibold" :class="large ? 'text-sm' : 'text-[13px]'">{{ column }}</h2>
      <span v-if="loading" class="h-2.5 w-3.5 rounded bg-cd-selected" />
      <span v-else class="font-mono text-xs text-cd-ink-muted">{{ cards.length }}</span>
      <button
        type="button"
        class="ml-auto cursor-pointer rounded p-0.5 text-cd-ink-muted hover:bg-cd-selected hover:text-cd-ink"
        :aria-label="`Collapse ${column}`"
        :title="`Collapse ${column}`"
        @click="emit('collapse')"
      >
        <ChevronsRightLeftIcon class="size-3.5" />
      </button>
    </div>
    <div v-if="state === 'locked'" class="flex items-center gap-1.5 px-1 text-[11px] text-cd-ink-muted" :title="reason">
      <LockIcon class="size-3 shrink-0" />
      <span class="line-clamp-2">{{ reason }}</span>
    </div>
    <div class="-mx-1 flex min-h-0 flex-col gap-2.5 overflow-y-auto px-1">
      <template v-if="loading">
        <div v-for="(w, i) in loading" :key="i" aria-hidden="true" class="flex flex-col gap-2.5 rounded-[10px] border border-cd-hairline bg-cd-surface p-3">
          <div class="flex gap-1.5"><span class="h-2.5 w-11 rounded bg-cd-sunken" /><span class="h-2.5 w-13 rounded bg-cd-sunken" /></div>
          <span class="h-3 w-full rounded bg-cd-selected" />
          <span class="h-3 rounded bg-cd-selected" :style="{ width: `${w}%` }" />
          <span class="h-2 rounded-full bg-cd-sunken" />
        </div>
      </template>
      <template v-else>
        <div
          v-if="!cards.length && state !== 'over'"
          class="flex items-center justify-center rounded-[10px] border border-dashed border-cd-selected px-4 text-center text-cd-ink-muted"
          :class="[hint ? 'h-30 text-xs leading-[17px]' : large ? 'h-24 text-[13px]' : 'h-22 text-xs']"
        >
          {{ hint ? (look(column).hint ?? look(column).empty) : look(column).empty }}
        </div>
        <template v-for="card in cards" :key="card.id">
          <div
            v-if="state === 'over' && beforeId === card.id"
            class="flex h-33 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-cd-accent text-center text-xs font-semibold text-cd-accent"
          >
            Drop to order it
            <span class="font-normal text-cd-ink-muted">{{ dropNote }}</span>
          </div>
          <CardTile :card="card" :selected="selected === card.id" :large="large" @open="emit('open', $event)" />
        </template>
        <div
          v-if="state === 'over' && !beforeId"
          class="flex h-33 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-cd-accent text-center text-xs font-semibold text-cd-accent"
        >
          {{ column === 'Next' ? 'Drop to order it' : 'Drop to move it' }}
          <span class="font-normal text-cd-ink-muted">{{ dropNote }}</span>
        </div>
      </template>
    </div>
  </section>
</template>
