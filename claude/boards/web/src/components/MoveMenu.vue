<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue';
import type { Target } from '@/api';
import { look } from '@/columns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// The card's column, as the design's pill, opening the moves the column rules
// allow from the web UI. A refused column shows, greyed, with why.
defineProps<{ column: string; targets: Target[]; small?: boolean }>();
const emit = defineEmits<{ move: [to: string] }>();
const short = (why: string) => why.replace(/^\S+ stays in [^:]+: /, '');
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-semibold"
        :class="small ? 'py-0.5 text-xs leading-5' : 'py-[3px] text-[13px]'"
        :style="{ background: look(column).soft, color: look(column).ink }"
        aria-label="Move this card"
      >
        <span class="size-[7px] rounded-full" :style="{ background: look(column).dot }" />{{ column }}
        <ChevronDownIcon class="size-3.5" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>Move to</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="t in targets.filter((x) => x.column !== column)"
        :key="t.column"
        :disabled="!!t.refused"
        class="flex-col items-start gap-0.5"
        @select="emit('move', t.column)"
      >
        <span class="flex items-center gap-2"><span class="size-2 rounded-full" :style="{ background: look(t.column).dot }" />{{ t.column }}</span>
        <span v-if="t.refused" class="text-xs text-muted-foreground">{{ short(t.refused) }}</span>
        <span v-else-if="t.gate" class="text-xs text-muted-foreground">Bypasses the {{ t.gate }} gate</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
