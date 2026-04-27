<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  hint: string;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
}>();
</script>

<template>
  <div class="rounded-2xl border border-default bg-default p-5">
    <div class="text-sm font-medium text-muted">{{ label }}</div>
    <div class="mt-3 text-2xl font-semibold tracking-tight text-highlighted">
      {{ value }}
    </div>
    <div class="mt-2 text-sm text-muted">
      {{ hint }}
    </div>
  </div>
</template>

