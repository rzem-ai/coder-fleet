<script setup lang="ts">
// The design's board navigation, with the two views the board has data for:
// every card, and the cards waiting on the human.
defineProps<{ name: string; total: number | null; waiting: number | null; view: 'board' | 'waiting'; large?: boolean }>();
const emit = defineEmits<{ view: [view: 'board' | 'waiting'] }>();
</script>

<template>
  <nav
    aria-label="Board navigation"
    class="flex shrink-0 flex-col gap-1 border-r border-cd-hairline bg-cd-rail"
    :class="large ? 'w-60 px-3.5 py-5' : 'w-[220px] px-3 py-4'"
  >
    <div class="flex items-center gap-2 px-2 pt-1" :class="large ? 'pb-5' : 'pb-4'">
      <svg :width="large ? 22 : 20" :height="large ? 22 : 20" viewBox="0 0 16 16" fill="none" stroke="var(--cd-accent)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="2" width="3.5" height="12" rx="1" /><rect x="6.25" y="2" width="3.5" height="8" rx="1" /><rect x="11" y="2" width="3.5" height="5" rx="1" /></svg>
      <span class="font-semibold" :class="large ? 'text-base' : 'text-[15px]'">{{ name }}</span>
    </div>
    <a
      v-for="item in [
        { key: 'board' as const, label: 'Board', dot: 'var(--cd-accent)', count: total },
        { key: 'waiting' as const, label: 'Needs you', dot: 'var(--cd-today)', count: waiting },
      ]"
      :key="item.key"
      href="#"
      class="flex items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-cd-ink no-underline"
      :class="[large ? 'py-[9px]' : 'py-2', view === item.key ? 'bg-cd-selected' : '']"
      @click.prevent="emit('view', item.key)"
    >
      <span class="size-2 rounded-full" :style="{ background: item.dot }" />
      <span class="grow">{{ item.label }}</span>
      <span v-if="item.count === null" class="h-2.5 w-4 rounded bg-cd-selected" />
      <span v-else class="font-mono text-xs text-cd-ink-muted">{{ item.count }}</span>
    </a>
  </nav>
</template>
