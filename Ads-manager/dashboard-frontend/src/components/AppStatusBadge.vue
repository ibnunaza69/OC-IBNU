<script setup lang="ts">
import { computed } from 'vue'

import { toneFromStatus } from '../utils/format'

const props = defineProps<{
  value?: string | boolean | null
  fallback?: string
}>()

const color = computed(() => toneFromStatus(props.value))
const label = computed(() => {
  if (typeof props.value === 'boolean') {
    return props.value ? 'valid' : 'invalid'
  }

  return props.value?.toString() || props.fallback || 'unknown'
})
</script>

<template>
  <UBadge :color="color" variant="soft">
    {{ label }}
  </UBadge>
</template>
