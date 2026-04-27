<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';

import AppIcon from './AppIcon.vue';

type WorkflowTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

interface WorkflowCanvasNodeData {
  label?: string;
  detail?: string;
  tone?: WorkflowTone;
}

const props = defineProps<NodeProps>();

const data = computed(() => (props.data ?? {}) as WorkflowCanvasNodeData);
const tone = computed<WorkflowTone>(() => data.value.tone ?? 'neutral');

const tonePalette = {
  primary: {
    badgeColor: 'primary',
    badgeLabel: 'entry',
    wrapper: 'border-primary/20 bg-default',
    icon: 'bg-primary/14 text-primary',
    kicker: 'text-primary/75'
  },
  success: {
    badgeColor: 'success',
    badgeLabel: 'service',
    wrapper: 'border-emerald-200/80 bg-default',
    icon: 'bg-emerald-500/12 text-emerald-600',
    kicker: 'text-emerald-700/75'
  },
  warning: {
    badgeColor: 'warning',
    badgeLabel: 'checkpoint',
    wrapper: 'border-amber-200/80 bg-default',
    icon: 'bg-amber-500/12 text-amber-600',
    kicker: 'text-amber-700/75'
  },
  error: {
    badgeColor: 'error',
    badgeLabel: 'risk',
    wrapper: 'border-rose-200/80 bg-default',
    icon: 'bg-rose-500/12 text-rose-600',
    kicker: 'text-rose-700/75'
  },
  neutral: {
    badgeColor: 'neutral',
    badgeLabel: 'process',
    wrapper: 'border-slate-200/80 bg-default',
    icon: 'bg-slate-900/6 text-slate-700',
    kicker: 'text-slate-500'
  }
} as const;

const toneMeta = computed(() => tonePalette[tone.value]);
</script>

<template>
  <div class="w-[240px] select-none rounded-2xl border px-4 py-4 text-slate-900 shadow-sm cursor-grab active:cursor-grabbing" :class="toneMeta.wrapper">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" :class="toneMeta.icon">
          <AppIcon name="workflow" class="size-5" />
        </div>
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-slate-900">{{ data.label || props.id }}</div>
          <div class="mt-1 truncate text-xs font-semibold uppercase tracking-wide" :class="toneMeta.kicker">{{ props.id }}</div>
        </div>
      </div>
      <UBadge :color="toneMeta.badgeColor" variant="soft">{{ toneMeta.badgeLabel }}</UBadge>
    </div>

    <p v-if="data.detail" class="mt-4 text-sm leading-6 text-slate-600">
      {{ data.detail }}
    </p>

    <Handle type="target" :position="Position.Left" class="!opacity-0 !pointer-events-none" />
    <Handle type="source" :position="Position.Right" class="!opacity-0 !pointer-events-none" />
  </div>
</template>

