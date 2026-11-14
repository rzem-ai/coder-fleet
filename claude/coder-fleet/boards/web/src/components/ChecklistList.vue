<script setup lang="ts">
import { XIcon } from '@lucide/vue';
import { ref } from 'vue';
import type { Item } from '@/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// One numbered list on a card: its acceptance criteria, its Definition of
// Done or its Actions for Human. An item is ticked once and stays ticked; a
// card's own criteria and Definition of Done items can be removed, a board
// default and an Action for Human cannot.
const props = defineProps<{ items: Item[]; placeholder: string; removable?: boolean; large?: boolean }>();
const emit = defineEmits<{ tick: [n: number]; remove: [n: number]; add: [text: string] }>();
const text = ref('');

function add() {
  const t = text.value.trim();
  if (!t) return;
  emit('add', t);
  text.value = '';
}
</script>

<template>
  <div class="flex flex-col">
    <label
      v-for="item in props.items"
      :key="item.n"
      class="group flex items-start gap-2.5 border-b border-cd-hairline"
      :class="[large ? 'py-[7px] text-sm leading-5' : 'py-1.5 text-[13px] leading-[19px]', item.ticked ? 'text-cd-ink-muted' : 'text-cd-ink']"
    >
      <Checkbox :model-value="item.ticked" :disabled="item.ticked" class="mt-0.5" @update:model-value="(v) => v && emit('tick', item.n)" />
      <span class="flex-1">{{ item.text }}<span v-if="item.fromDefaults" class="ml-2 text-xs text-cd-ink-muted">board default</span></span>
      <button
        v-if="removable && !item.fromDefaults"
        type="button"
        class="invisible cursor-pointer text-cd-ink-muted group-hover:visible hover:text-cd-ink"
        :aria-label="`Remove item ${item.n}`"
        @click.prevent="emit('remove', item.n)"
      >
        <XIcon class="size-3.5" />
      </button>
    </label>
    <form class="pt-2" @submit.prevent="add">
      <Input v-model="text" :placeholder="placeholder" :aria-label="placeholder" class="h-7 text-[13px]" />
    </form>
  </div>
</template>
