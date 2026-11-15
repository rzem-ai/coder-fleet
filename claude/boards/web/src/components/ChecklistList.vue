<script setup lang="ts">
import { XIcon } from '@lucide/vue';
import { ref } from 'vue';
import type { Item } from '@/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// One numbered list on a card: its acceptance criteria, its Definition of
// Done or its Actions for Human. Criteria and Definition of Done items tick
// and untick, and the card's own ones can be edited in place and removed; a
// board default changes only in config.yml. An Action for Human is ticked
// once and stays ticked.
const props = defineProps<{ items: Item[]; placeholder: string; editable?: boolean; large?: boolean }>();
const emit = defineEmits<{ tick: [n: number]; untick: [n: number]; edit: [n: number, text: string]; remove: [n: number]; add: [text: string] }>();
const text = ref('');
const editing = ref<number | null>(null);
const draft = ref('');

function add() {
  const t = text.value.trim();
  if (!t) return;
  emit('add', t);
  text.value = '';
}

function startEdit(item: Item) {
  if (!props.editable || item.fromDefaults) return;
  editing.value = item.n;
  draft.value = item.text;
}

function saveEdit(item: Item) {
  if (editing.value !== item.n) return;
  editing.value = null;
  const t = draft.value.trim();
  if (t && t !== item.text) emit('edit', item.n, t);
}

function toggle(item: Item, on: boolean | 'indeterminate') {
  if (on === true && !item.ticked) emit('tick', item.n);
  else if (on === false && item.ticked && props.editable) emit('untick', item.n);
}
</script>

<template>
  <div class="flex flex-col">
    <div
      v-for="item in props.items"
      :key="item.n"
      class="group flex items-start gap-2.5 border-b border-cd-hairline"
      :class="[large ? 'py-[7px] text-sm leading-5' : 'py-1.5 text-[13px] leading-[19px]', item.ticked ? 'text-cd-ink-muted' : 'text-cd-ink']"
    >
      <Checkbox
        :model-value="item.ticked"
        :disabled="item.ticked && !editable"
        class="mt-0.5"
        :aria-label="`${item.ticked ? 'Untick' : 'Tick'} item ${item.n}`"
        @update:model-value="(v) => toggle(item, v)"
      />
      <form v-if="editing === item.n" class="flex-1" @submit.prevent="saveEdit(item)">
        <Input v-model="draft" :aria-label="`Text of item ${item.n}`" class="h-7 text-[13px]" autofocus @blur="saveEdit(item)" @keydown.esc="editing = null" />
      </form>
      <span v-else class="flex-1" :class="editable && !item.fromDefaults ? 'cursor-text' : ''" :title="editable && !item.fromDefaults ? 'Click to edit' : undefined" @click="startEdit(item)">
        {{ item.text }}<span v-if="item.fromDefaults" class="ml-2 text-xs text-cd-ink-muted">board default</span>
      </span>
      <button
        v-if="editable && !item.fromDefaults"
        type="button"
        class="invisible cursor-pointer text-cd-ink-muted group-hover:visible hover:text-cd-ink"
        :aria-label="`Remove item ${item.n}`"
        @click="emit('remove', item.n)"
      >
        <XIcon class="size-3.5" />
      </button>
    </div>
    <form class="pt-2" @submit.prevent="add">
      <Input v-model="text" :placeholder="placeholder" :aria-label="placeholder" class="h-7 text-[13px]" />
    </form>
  </div>
</template>
