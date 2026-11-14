<script setup lang="ts">
import { ChevronLeftIcon, Trash2Icon, XIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { type CardView, cardOp, deleteCard, runLog } from '@/api';
import { look } from '@/columns';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import ActivityList from './ActivityList.vue';
import ChecklistList from './ChecklistList.vue';
import MoveMenu from './MoveMenu.vue';

// One card, open: on a laptop as its own page, on a desktop beside the
// board, and on an ultrawide screen beside the board with every section in
// view. Every change goes to the board's own functions through the API.
const props = defineProps<{ card: CardView; layout: 'page' | 'aside' | 'wide' }>();
const emit = defineEmits<{ close: []; changed: [card: CardView]; deleted: []; failed: [message: string] }>();

const wide = computed(() => props.layout === 'wide');
const open = computed(() => props.card.actions.filter((a) => !a.ticked));
const ticked = (items: { ticked: boolean }[]) => items.filter((i) => i.ticked).length;
const activityCount = computed(() => props.card.history.length + props.card.comments.length + props.card.runs.length);
const latest = computed(() => props.card.history.at(-1));

async function op(name: string, body: Record<string, unknown>) {
  try {
    emit('changed', await cardOp(props.card.id, name, body));
  } catch (e) {
    emit('failed', (e as Error).message);
  }
}

const editingTitle = ref(false);
const title = ref('');
function editTitle() {
  title.value = props.card.title;
  editingTitle.value = true;
}
async function saveTitle() {
  editingTitle.value = false;
  if (title.value.trim() && title.value.trim() !== props.card.title) await op('edit', { title: title.value });
}

const body = ref(props.card.body);
watch(
  () => props.card.body,
  (b) => {
    body.value = b;
  },
);

const confirming = ref(false);
async function remove() {
  confirming.value = false;
  try {
    await deleteCard(props.card.id);
    emit('deleted');
  } catch (e) {
    emit('failed', (e as Error).message);
  }
}

const log = ref<{ release: string; text: string } | null>(null);
async function showLog(release: string) {
  log.value = { release, text: await runLog(release) };
}

const SOURCE: Record<string, string> = { hook: 'a hook', mcp: 'an agent', cli: 'the CLI', web: 'you' };
function hm(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header v-if="layout === 'page'" class="flex h-14 shrink-0 items-center gap-2 border-b border-cd-hairline pr-3 pl-2">
      <Button variant="ghost" size="sm" @click="emit('close')"><ChevronLeftIcon />Board</Button>
      <span class="text-sm text-cd-ink-muted">/</span>
      <span class="font-mono text-[13px] text-cd-ink-muted">{{ card.id }}</span>
      <div class="grow" />
      <Button variant="ghost" size="icon" aria-label="Delete card" @click="confirming = true"><Trash2Icon /></Button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto" :class="layout === 'page' ? 'gap-[18px] px-6 py-5' : wide ? 'gap-6 px-8 py-7' : 'gap-[18px] px-6 py-5'">
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2.5">
          <span v-if="layout !== 'page'" class="font-mono text-[13px] text-cd-ink-muted">{{ card.id }}</span>
          <MoveMenu :column="card.column" :targets="card.targets" :small="layout === 'page'" @move="(to) => op('move', { to })" />
          <div class="flex-1" />
          <span v-if="layout === 'page' && card.parent" class="text-xs text-cd-ink-muted">Sub-issue of {{ card.parent }}</span>
          <Button v-if="layout !== 'page'" variant="ghost" size="icon" aria-label="Delete card" @click="confirming = true"><Trash2Icon /></Button>
          <Button v-if="layout !== 'page'" variant="ghost" size="icon" aria-label="Close details" @click="emit('close')"><XIcon /></Button>
        </div>
        <form v-if="editingTitle" @submit.prevent="saveTitle">
          <Input v-model="title" aria-label="Title" class="h-auto py-1 text-xl font-bold" autofocus @blur="saveTitle" @keydown.esc="editingTitle = false" />
        </form>
        <component
          :is="layout === 'page' ? 'h1' : 'h2'"
          v-else
          class="m-0 cursor-text font-bold tracking-[-0.01em]"
          :class="layout === 'page' ? 'text-[22px] leading-7' : wide ? 'text-[26px] leading-8' : 'text-[21px] leading-[27px]'"
          title="Click to edit the title"
          @click="editTitle"
        >
          {{ card.title }}
        </component>
      </div>

      <dl
        v-if="layout !== 'page'"
        class="m-0 grid gap-y-2 rounded-[10px] bg-cd-sunken"
        :class="wide ? 'grid-cols-[120px_1fr] gap-y-2.5 p-4 text-sm' : 'grid-cols-[96px_1fr] px-3.5 py-3 text-[13px]'"
      >
        <template v-if="card.parent">
          <dt class="font-semibold text-cd-ink-muted">Parent</dt>
          <dd class="m-0 font-mono">{{ card.parent }}</dd>
        </template>
        <dt class="font-semibold text-cd-ink-muted">Depends on</dt>
        <dd class="m-0" :class="card.dependencies.length ? 'font-mono' : ''">{{ card.dependencies.join(', ') || 'No card' }}</dd>
        <dt class="font-semibold text-cd-ink-muted">Updated</dt>
        <dd class="m-0">{{ new Date(card.updated).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) }}</dd>
      </dl>

      <section v-if="open.length" aria-labelledby="waiting-head" class="flex flex-col gap-3 rounded-[10px] bg-cd-today-soft p-4">
        <div class="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--cd-today)" aria-hidden="true"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" /></svg>
          <h2 id="waiting-head" class="m-0 text-[13px] font-bold text-cd-today-ink">The fleet is waiting on you</h2>
        </div>
        <label v-for="a in open" :key="a.n" class="flex items-start gap-2.5 rounded-lg border border-cd-hairline bg-cd-surface px-3 py-2.5">
          <Checkbox :model-value="false" class="mt-0.5" @update:model-value="(v) => v && op('tick', { list: 'actions', n: a.n })" />
          <span class="text-sm leading-5 font-semibold">{{ a.text }}</span>
        </label>
        <span class="text-xs text-cd-today-ink">Tick each one once it is done. With every action ticked, the card returns to the fleet at its next hook.</span>
      </section>

      <template v-if="wide">
        <section class="flex flex-col gap-1">
          <h3 class="m-0 mb-2 flex justify-between border-b border-cd-hairline pb-2 text-lg font-bold text-cd-accent">
            Acceptance criteria <span class="font-mono text-sm font-medium text-cd-ink-muted">{{ ticked(card.criteria) }} of {{ card.criteria.length }}</span>
          </h3>
          <ChecklistList :items="card.criteria" placeholder="Add a criterion" editable large @tick="(n) => op('tick', { list: 'criteria', n })" @remove="(n) => op('remove', { list: 'criteria', n })" @untick="(n) => op('untick', { list: 'criteria', n })" @edit="(n, text) => op('edititem', { list: 'criteria', n, text })" @add="(text) => op('add', { list: 'criteria', text })" />
        </section>
        <section class="flex flex-col gap-1">
          <h3 class="m-0 mb-2 flex justify-between border-b border-cd-hairline pb-2 text-lg font-bold text-cd-accent">
            Definition of Done <span class="font-mono text-sm font-medium text-cd-ink-muted">{{ ticked(card.dod) }} of {{ card.dod.length }}</span>
          </h3>
          <ChecklistList :items="card.dod" placeholder="Add a Definition of Done item" editable large @tick="(n) => op('tick', { list: 'dod', n })" @remove="(n) => op('remove', { list: 'dod', n })" @untick="(n) => op('untick', { list: 'dod', n })" @edit="(n, text) => op('edititem', { list: 'dod', n, text })" @add="(text) => op('add', { list: 'dod', text })" />
        </section>
        <section class="flex flex-col gap-1">
          <h3 class="m-0 mb-2 border-b border-cd-hairline pb-2 text-lg font-bold text-cd-accent">Activity</h3>
          <ActivityList :card="card" large @comment="(text) => op('comment', { text })" @log="showLog" />
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="m-0 mb-2 border-b border-cd-hairline pb-2 text-lg font-bold text-cd-accent">Details</h3>
          <Textarea v-model="body" aria-label="Description" placeholder="Describe the card" class="min-h-24 text-sm" />
          <Button v-if="body !== card.body" size="sm" class="self-start" @click="op('edit', { body })">Save the description</Button>
          <h4 class="m-0 mt-3 text-sm font-semibold">Actions for Human</h4>
          <ChecklistList :items="card.actions" placeholder="Add an Action for Human" large @tick="(n) => op('tick', { list: 'actions', n })" @add="(text) => op('add', { list: 'actions', text })" />
        </section>
      </template>

      <Tabs v-else default-value="criteria" class="flex min-h-0 flex-col gap-2">
        <TabsList class="self-start">
          <TabsTrigger value="criteria">Criteria {{ ticked(card.criteria) }}/{{ card.criteria.length }}</TabsTrigger>
          <TabsTrigger value="activity">Activity {{ activityCount }}</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="criteria" class="flex flex-col gap-4">
          <ChecklistList :items="card.criteria" placeholder="Add a criterion" editable :large="layout === 'page'" @tick="(n) => op('tick', { list: 'criteria', n })" @remove="(n) => op('remove', { list: 'criteria', n })" @untick="(n) => op('untick', { list: 'criteria', n })" @edit="(n, text) => op('edititem', { list: 'criteria', n, text })" @add="(text) => op('add', { list: 'criteria', text })" />
          <div class="flex flex-col gap-1">
            <h3 class="m-0 text-[13px] font-semibold text-cd-ink-muted">Definition of Done {{ ticked(card.dod) }}/{{ card.dod.length }}</h3>
            <ChecklistList :items="card.dod" placeholder="Add a Definition of Done item" editable :large="layout === 'page'" @tick="(n) => op('tick', { list: 'dod', n })" @remove="(n) => op('remove', { list: 'dod', n })" @untick="(n) => op('untick', { list: 'dod', n })" @edit="(n, text) => op('edititem', { list: 'dod', n, text })" @add="(text) => op('add', { list: 'dod', text })" />
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <ActivityList :card="card" @comment="(text) => op('comment', { text })" @log="showLog" />
        </TabsContent>
        <TabsContent value="details" class="flex flex-col gap-2">
          <Textarea v-model="body" aria-label="Description" placeholder="Describe the card" class="min-h-24 text-[13px]" />
          <Button v-if="body !== card.body" size="sm" class="self-start" @click="op('edit', { body })">Save the description</Button>
          <h3 class="m-0 mt-3 text-[13px] font-semibold">Actions for Human</h3>
          <ChecklistList :items="card.actions" placeholder="Add an Action for Human" @tick="(n) => op('tick', { list: 'actions', n })" @add="(text) => op('add', { list: 'actions', text })" />
          <p class="m-0 text-xs text-cd-ink-muted">Adding one moves the card to Blocked by Human.</p>
          <template v-if="layout === 'page'">
            <h3 class="m-0 mt-3 text-[13px] font-semibold">Depends on</h3>
            <p class="m-0 text-[13px]" :class="card.dependencies.length ? 'font-mono' : 'text-cd-ink-muted'">{{ card.dependencies.join(', ') || 'No card' }}</p>
          </template>
        </TabsContent>
      </Tabs>

      <div v-if="layout === 'aside' && latest" class="mt-auto flex items-center gap-2 border-t border-cd-hairline pt-3.5">
        <span class="size-[7px] rounded-full" :style="{ background: look(latest.to).dot }" />
        <span class="text-xs text-cd-ink-muted">Latest: moved to {{ latest.to }} by {{ SOURCE[latest.source] ?? latest.source }}, {{ hm(latest.time) }}</span>
      </div>
    </div>

    <Dialog v-model:open="confirming">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {{ card.id }}?</DialogTitle>
          <DialogDescription>Its file goes for good, and its number is never handed out again. The event log keeps a line for the deletion.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="confirming = false">Keep it</Button>
          <Button variant="destructive" @click="remove">Delete the card</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!log" @update:open="(v) => !v && (log = null)">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test run {{ log?.release }}</DialogTitle>
          <DialogDescription>The run's log, as the board keeps it beside the board.</DialogDescription>
        </DialogHeader>
        <pre class="max-h-[60vh] overflow-auto rounded-md bg-cd-sunken p-3 font-mono text-xs whitespace-pre-wrap">{{ log?.text }}</pre>
      </DialogContent>
    </Dialog>
  </div>
</template>
