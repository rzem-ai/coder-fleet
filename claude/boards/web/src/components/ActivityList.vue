<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CardView } from '@/api';
import { look } from '@/columns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// A card's own activity, newest first: its column moves from the event
// trail, its comments, and the release test runs that named it, each with a
// way to its log. There is no board-wide feed.
const props = defineProps<{ card: CardView; large?: boolean }>();
const emit = defineEmits<{ comment: [text: string]; log: [release: string] }>();
const draft = ref('');

const SOURCE: Record<string, string> = { hook: 'a hook', mcp: 'an agent, through MCP', cli: 'the CLI', web: 'you, in the web UI' };

interface Entry {
  key: string;
  dot: string;
  title: string;
  body: string;
  time: string;
  release?: string;
}

function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  return sameDay ? hm : `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} ${hm}`;
}

const entries = computed<Entry[]>(() => {
  const moves = props.card.history.map((e, i) => ({
    key: `m${i}`,
    at: e.time,
    dot: look(e.to).dot,
    title: `Moved to ${e.to}`,
    body: `From ${e.from}, by ${SOURCE[e.source] ?? e.source}${e.actor ? ` (${e.actor})` : ''}.${e.gate ? ` It bypassed the ${e.gate} gate.` : ''}`,
  }));
  const comments = props.card.comments.map((c, i) => ({ key: `c${i}`, at: c.time, dot: 'var(--cd-accent)', title: `Comment from ${c.by}`, body: c.text }));
  const timed = [...moves, ...comments].sort((a, b) => b.at.localeCompare(a.at)).map(({ at, ...e }) => ({ ...e, time: when(at) }));
  const runs = props.card.runs.map((r) => ({
    key: `r${r.release}`,
    dot: r.state === 'passed' ? 'var(--cd-logbook)' : r.state === 'running' ? 'var(--cd-anytime)' : 'var(--cd-upcoming)',
    title: `Release test run, ${r.tag}: ${r.state}`,
    body: `Commit ${r.commit.slice(0, 12)}.`,
    time: '',
    release: r.release,
  }));
  return [...runs, ...timed];
});

function send() {
  const t = draft.value.trim();
  if (!t) return;
  emit('comment', t);
  draft.value = '';
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div v-for="e in entries" :key="e.key" class="flex gap-3 py-2">
      <span class="mt-1.5 size-2 shrink-0 rounded-full" :style="{ background: e.dot }" />
      <div class="flex flex-1 flex-col gap-0.5">
        <span class="font-semibold" :class="large ? 'text-sm' : 'text-[13px]'">{{ e.title }}</span>
        <span class="whitespace-pre-wrap text-cd-ink-muted" :class="large ? 'text-[13px] leading-[18px]' : 'text-xs leading-[17px]'">{{ e.body }}</span>
        <button v-if="e.release" type="button" class="cursor-pointer self-start text-xs text-cd-accent hover:underline" @click="emit('log', e.release)">Read its log</button>
      </div>
      <span class="font-mono text-xs text-cd-ink-muted">{{ e.time }}</span>
    </div>
    <p v-if="!entries.length" class="m-0 py-2 text-[13px] text-cd-ink-muted">No moves or comments yet.</p>
    <form class="flex flex-col gap-2 pt-2" @submit.prevent="send">
      <Textarea v-model="draft" placeholder="Add a comment" aria-label="Add a comment" class="min-h-16 text-[13px]" />
      <Button type="submit" size="sm" variant="outline" class="self-start" :disabled="!draft.trim()">Comment</Button>
    </form>
  </div>
</template>
