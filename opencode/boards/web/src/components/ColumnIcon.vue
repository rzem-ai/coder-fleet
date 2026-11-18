<script setup lang="ts">
import { look } from '@/columns';

// A column's marker: its icon from columns.ts, in its icon colour. Size it
// with a class, as the other Lucide icons are.
defineProps<{ column: string }>();
</script>

<template>
  <component :is="look(column).icon" class="shrink-0" :style="{ color: look(column).iconColour ?? look(column).dot }" aria-hidden="true" />
</template>
