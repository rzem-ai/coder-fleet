<script setup lang="ts">
import { SlidersHorizontalIcon } from '@lucide/vue';
import { useWindowSize } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { type BoardView, type CardSummary, type CardView, cardOp, getBoard, getCard, newCard } from './api';
import { ACTIVE, look, RAILS } from './columns';
import { drag, pressCard, swallowClick, trackPointer } from './drag';
import BoardLane from './components/BoardLane.vue';
import CardDetail from './components/CardDetail.vue';
import ColumnRail from './components/ColumnRail.vue';
import NavRail from './components/NavRail.vue';
import NewCardDialog from './components/NewCardDialog.vue';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Progress } from './components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';

const COLUMNS = ['Draft', 'Backlog', 'Next', 'In Progress', 'Done', 'Released', 'Blocked', 'Blocked by Human'];
// The skeleton the loading board draws in each lane: widths of a title's second line.
const SKELETON: Record<string, number[]> = { Backlog: [70, 45, 60], Next: [55], 'In Progress': [65], Blocked: [40], 'Blocked by Human': [75] };

const board = ref<BoardView | null>(null);
const detail = ref<CardView | null>(null);
const selected = ref<string | null>(decodeURIComponent(location.hash.slice(1)) || null);
const query = ref('');
const readyOnly = ref(false);
const view = ref<'board' | 'waiting'>('board');
const tab = ref<'active' | 'all'>('active');
const unfolded = ref<string[]>([]);
const creating = ref(false);
const failure = ref('');

const { width } = useWindowSize();
const size = computed(() => (width.value < 1100 ? 'laptop' : width.value < 2000 ? 'desktop' : 'ultrawide'));
const large = computed(() => size.value === 'ultrawide');

let failTimer: ReturnType<typeof setTimeout> | undefined;
function fail(message: string) {
  failure.value = message;
  clearTimeout(failTimer);
  failTimer = setTimeout(() => (failure.value = ''), 8000);
}

async function load() {
  try {
    board.value = await getBoard();
    if (selected.value) detail.value = await getCard(selected.value);
  } catch (e) {
    fail((e as Error).message);
  }
}

watch(selected, (id) => {
  history.replaceState(null, '', id ? `#${encodeURIComponent(id)}` : location.pathname);
  if (!id) detail.value = null;
  else getCard(id).then((c) => (detail.value = c), (e: Error) => fail(e.message));
});

function openCard(id: string) {
  if (swallowClick()) return;
  selected.value = id;
}

async function changed(card: CardView) {
  detail.value = card;
  board.value = await getBoard();
}

async function deleted() {
  selected.value = null;
  await load();
}

async function drop(card: CardSummary, to: string, index: number) {
  try {
    const body = to === card.column ? { index } : to === 'Next' ? { to, index } : { to };
    await cardOp(card.id, to === card.column ? 'order' : 'move', body);
  } catch (e) {
    fail((e as Error).message);
  }
  await load();
}

async function create(title: string) {
  try {
    const card = await newCard(title);
    board.value = await getBoard();
    selected.value = card.id;
  } catch (e) {
    fail((e as Error).message);
  }
}

let stopTracking = () => {};
let poll: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  load();
  stopTracking = trackPointer(drop);
  // Hooks move cards while the board is open; this keeps it current.
  poll = setInterval(() => {
    if (!drag.card && document.visibilityState === 'visible') load();
  }, 5000);
});
onUnmounted(() => {
  stopTracking();
  clearInterval(poll);
});

const cards = computed(() => board.value?.cards ?? []);
const waiting = computed(() => cards.value.filter((c) => c.actions.length).length);
const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return cards.value.filter(
    (c) => (!q || c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) && (!readyOnly.value || c.ready) && (view.value === 'board' || c.actions.length),
  );
});
const inColumn = (column: string) => visible.value.filter((c) => c.column === column);
const loading = computed(() => !board.value);
const empty = computed(() => !!board.value && !cards.value.length);
const summary = computed(() => {
  if (loading.value) return 'Loading cards from ~/.config/boards';
  if (empty.value) return 'Nothing on the board yet';
  return `${cards.value.length} card${cards.value.length === 1 ? '' : 's'}, ${waiting.value} need${waiting.value === 1 ? 's' : ''} you`;
});

// The lanes an open card leaves in view: the active ones, Blocked only when
// something is in it.
const activeLanes = computed(() => ACTIVE.filter((c) => c !== 'Blocked' || inColumn(c).length));

// The desktop board: every column in its order, the ones a card is finished
// or not started in folded to rails until opened. With a card open, the
// active lanes alone.
const desktopColumns = computed(() =>
  detail.value ? activeLanes.value.map((column) => ({ column, rail: false })) : COLUMNS.map((column) => ({ column, rail: RAILS.includes(column) && !unfolded.value.includes(column) })),
);
const desktopGrid = computed(() => desktopColumns.value.map((c) => (c.rail ? '48px' : 'minmax(0, 1fr)')).join(' '));

function unfold(column: string) {
  selected.value = null;
  if (!unfolded.value.includes(column)) unfolded.value = [...unfolded.value, column];
}

function showAll(column: string) {
  tab.value = 'all';
  requestAnimationFrame(() => document.querySelector(`[data-column="${column}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }));
}

const lifted = computed(() => (drag.started ? drag.card : null));
const liftedPct = computed(() => (lifted.value?.criteria.total ? Math.round((100 * lifted.value.criteria.ticked) / lifted.value.criteria.total) : 0));
</script>

<template>
  <div class="relative flex h-full overflow-hidden bg-cd-surface text-cd-ink" :class="size === 'laptop' ? 'flex-col' : ''">
    <!-- Laptop: one column of chrome above the lanes, and an open card as its own page. -->
    <template v-if="size === 'laptop'">
      <CardDetail v-if="detail" :card="detail" layout="page" @close="selected = null" @changed="changed" @deleted="deleted" @failed="fail" />
      <template v-else>
        <header class="flex h-14 shrink-0 items-center gap-3 border-b border-cd-hairline px-4">
          <div class="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--cd-accent)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="2" width="3.5" height="12" rx="1" /><rect x="6.25" y="2" width="3.5" height="8" rx="1" /><rect x="11" y="2" width="3.5" height="5" rx="1" /></svg>
            <span class="text-sm font-semibold">{{ board?.name ?? 'Board' }}</span>
            <span class="text-sm text-cd-ink-muted">/ {{ view === 'waiting' ? 'Needs you' : 'Board' }}</span>
          </div>
          <div class="grow" />
          <Input v-model="query" placeholder="Search cards" aria-label="Search cards" class="w-[200px]" />
          <Button :variant="readyOnly ? 'default' : 'outline'" size="icon" aria-label="Filter: only cards whose dependencies are done" :aria-pressed="readyOnly" @click="readyOnly = !readyOnly">
            <SlidersHorizontalIcon />
          </Button>
          <Button size="sm" @click="creating = true">New card</Button>
        </header>
        <div class="flex h-[52px] shrink-0 items-center gap-2 border-b border-cd-hairline bg-cd-rail px-4">
          <Tabs v-model="tab">
            <TabsList>
              <TabsTrigger value="active">Active lanes</TabsTrigger>
              <TabsTrigger value="all">All columns</TabsTrigger>
            </TabsList>
          </Tabs>
          <div class="grow" />
          <a
            v-for="column in ['Backlog', 'Done']"
            :key="column"
            :href="`#${column}`"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-cd-ink no-underline"
            @click.prevent="showAll(column)"
          >
            <span class="size-2 rounded-full" :style="{ background: look(column).dot }" />{{ column }}
            <span class="font-mono text-cd-ink-muted">{{ loading ? '' : inColumn(column).length }}</span>
          </a>
        </div>
        <main v-if="tab === 'active'" class="flex min-h-0 grow flex-col p-4" :class="empty ? 'gap-7' : 'gap-5'">
          <div class="grid min-h-0 gap-3" :style="{ gridTemplateColumns: `repeat(${activeLanes.length}, minmax(0, 1fr))` }">
            <BoardLane
              v-for="column in activeLanes"
              :key="column"
              :column="column"
              :cards="inColumn(column)"
              :selected="selected"
              :loading="loading ? (SKELETON[column] ?? [50]) : undefined"
              :hint="empty"
              @open="openCard"
            />
          </div>
          <section v-if="empty" aria-labelledby="empty-head" class="flex flex-col items-center gap-3 px-16 py-2 text-center">
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="var(--cd-accent)" stroke-width="1" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="2" width="3.5" height="12" rx="1" /><rect x="6.25" y="2" width="3.5" height="8" rx="1" stroke-dasharray="1.5 1.5" /><rect x="11" y="2" width="3.5" height="5" rx="1" stroke-dasharray="1.5 1.5" /></svg>
            <h2 id="empty-head" class="m-0 text-xl font-bold">Nothing on the board yet</h2>
            <p class="m-0 max-w-[460px] text-sm leading-[21px] text-cd-ink-muted">Add a card for the first thing you want built. Or run /kickoff in a session and the fleet will turn your first idea into a card with its acceptance criteria.</p>
            <div class="mt-1 flex gap-2"><Button @click="creating = true">New card</Button></div>
          </section>
          <section v-else-if="!loading" id="Backlog" data-column="Backlog" class="flex min-h-0 flex-col border-t border-cd-hairline pt-3.5">
            <div class="mb-1.5 flex items-center gap-2">
              <span class="size-2 rounded-full" :style="{ background: look('Backlog').dot }" />
              <h2 class="m-0 text-[13px] font-semibold">Up from Backlog</h2>
              <span class="text-xs text-cd-ink-muted">waiting on your order to move into Next</span>
            </div>
            <div class="min-h-0 overflow-y-auto">
              <div
                v-for="card in inColumn('Backlog')"
                :key="card.id"
                :data-card-id="card.id"
                class="flex cursor-pointer touch-none items-center gap-3 border-b border-cd-hairline px-1 py-2.5 select-none"
                @pointerdown="pressCard($event, card)"
                @click="openCard(card.id)"
              >
                <span class="w-14 shrink-0 font-mono text-[11px] text-cd-ink-muted">{{ card.id }}</span>
                <span class="min-w-0 grow truncate text-[13px]">{{ card.title }}</span>
                <span class="w-8 text-right font-mono text-[11px] text-cd-ink-muted">{{ card.criteria.ticked }}/{{ card.criteria.total }}</span>
              </div>
              <p v-if="!inColumn('Backlog').length" class="m-0 px-1 py-2.5 text-[13px] text-cd-ink-muted">Nothing in Backlog.</p>
            </div>
          </section>
        </main>
        <main v-else class="flex min-h-0 grow gap-3 overflow-x-auto p-4">
          <BoardLane
            v-for="column in COLUMNS"
            :key="column"
            :column="column"
            :cards="inColumn(column)"
            :selected="selected"
            :loading="loading ? (SKELETON[column] ?? [50]) : undefined"
            class="w-[220px] shrink-0"
            @open="openCard"
          />
        </main>
      </template>
    </template>

    <!-- Desktop and ultrawide: the navigation rail, the board, and an open card beside it. -->
    <template v-else>
      <NavRail :name="board?.name ?? ''" :total="loading ? null : cards.length" :waiting="loading ? null : waiting" :view="view" :large="large" @view="(v) => (view = v)" />
      <div class="flex min-w-0 grow flex-col">
        <header class="flex shrink-0 items-center gap-3 border-b border-cd-hairline" :class="large ? 'h-16 px-6' : 'h-[60px] px-5'">
          <h1 class="m-0 font-semibold" :class="large ? 'text-xl' : 'text-lg'">{{ view === 'waiting' ? 'Needs you' : 'Board' }}</h1>
          <span class="text-cd-ink-muted" :class="large ? 'text-sm' : 'text-[13px]'" role="status">{{ detail && size === 'desktop' ? 'Active lanes while a card is open' : summary }}</span>
          <div class="grow" />
          <template v-if="detail && size === 'desktop'">
            <Button v-for="column in ['Backlog', 'Done']" :key="column" variant="outline" size="sm" @click="unfold(column)">{{ column }} {{ inColumn(column).length }}</Button>
          </template>
          <template v-else>
            <Input v-model="query" placeholder="Search cards" aria-label="Search cards" :class="large ? 'w-[360px]' : 'w-[280px]'" />
            <Button :variant="readyOnly ? 'default' : 'outline'" :size="large ? 'default' : 'sm'" :aria-pressed="readyOnly" title="Only the cards whose dependencies are all in Done or Released" @click="readyOnly = !readyOnly">
              {{ readyOnly ? 'Filter: ready' : 'Filter' }}
            </Button>
          </template>
          <Button :size="large ? 'default' : 'sm'" @click="creating = true">New card</Button>
        </header>
        <main
          v-if="size === 'desktop'"
          class="relative grid min-h-0 grow gap-3 px-5 py-4"
          :style="{ gridTemplateColumns: detail ? `repeat(${desktopColumns.length}, minmax(0, 1fr))` : desktopGrid }"
        >
          <template v-for="c in desktopColumns" :key="c.column">
            <ColumnRail v-if="c.rail" :column="c.column" :count="inColumn(c.column).length" :loading="loading" @open="unfold(c.column)" />
            <BoardLane v-else :column="c.column" :cards="inColumn(c.column)" :selected="selected" :loading="loading ? (SKELETON[c.column] ?? [50]) : undefined" @open="openCard" />
          </template>
        </main>
        <main v-else class="grid min-h-0 grow grid-cols-8 gap-4 px-6 py-5">
          <BoardLane
            v-for="column in COLUMNS"
            :key="column"
            :column="column"
            :cards="inColumn(column)"
            :selected="selected"
            :loading="loading ? (SKELETON[column] ?? [50]) : undefined"
            large
            @open="openCard"
          />
        </main>
      </div>
      <aside v-if="detail" aria-label="Card details" class="shrink-0 border-l border-cd-hairline" :class="large ? 'w-[600px]' : 'w-[520px]'">
        <CardDetail :card="detail" :layout="large ? 'wide' : 'aside'" @close="selected = null" @changed="changed" @deleted="deleted" @failed="fail" />
      </aside>
    </template>

    <div v-if="failure" role="alert" class="absolute bottom-4 left-1/2 z-50 max-w-[640px] -translate-x-1/2 rounded-[10px] bg-cd-upcoming-soft px-4 py-3 text-[13px] text-cd-upcoming shadow-lg">
      {{ failure }}
    </div>

    <article
      v-if="lifted"
      aria-hidden="true"
      class="pointer-events-none fixed z-50 flex -rotate-2 cursor-grabbing flex-col gap-2.5 rounded-[10px] border-2 border-cd-accent bg-cd-surface p-3"
      :style="{ left: `${drag.x - drag.dx}px`, top: `${drag.y - drag.dy}px`, width: `${drag.width}px` }"
    >
      <span class="font-mono text-[11px] text-cd-ink-muted">{{ lifted.id }}</span>
      <h3 class="m-0 text-[13px] leading-[18px] font-medium">{{ lifted.title }}</h3>
      <div class="flex items-center gap-2">
        <Progress :model-value="liftedPct" aria-label="Acceptance criteria" class="flex-1" />
        <span class="font-mono text-[11px] text-cd-ink-muted">{{ lifted.criteria.ticked }}/{{ lifted.criteria.total }}</span>
      </div>
    </article>

    <NewCardDialog v-model:open="creating" @create="create" />
  </div>
</template>
