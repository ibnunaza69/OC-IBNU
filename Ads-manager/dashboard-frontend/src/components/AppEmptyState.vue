<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div class="rounded-2xl border border-dashed border-default bg-default/70 p-8 text-center">
    <div class="text-base font-semibold text-highlighted">{{ title }}</div>
    <p class="mt-2 text-sm leading-6 text-muted">{{ description }}</p>
  </div>
</template>
