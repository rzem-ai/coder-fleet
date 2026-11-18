<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ create: [title: string] }>();
const title = ref('');

function create() {
  if (!title.value.trim()) return;
  emit('create', title.value.trim());
  title.value = '';
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New card</DialogTitle>
        <DialogDescription>Every card is filed into Draft, and leaves it for Backlog.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="create">
        <Input v-model="title" placeholder="What should be built" aria-label="Title" autofocus />
        <DialogFooter>
          <Button type="submit" :disabled="!title.trim()">File it</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
