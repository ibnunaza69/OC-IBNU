<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="space-y-2">
    <div v-if="eyebrow" class="text-xs font-semibold uppercase tracking-wide text-muted">{{ eyebrow }}</div>
    <h1 class="text-xl font-semibold tracking-tight text-highlighted sm:text-2xl">{{ title }}</h1>
    <p v-if="description" class="max-w-2xl text-sm leading-6 text-muted">
      {{ description }}
    </p>
  </div>
</template>

