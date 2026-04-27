<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MarkerType, Position, VueFlow, type Edge, type Node } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppIcon from '../components/AppIcon.vue'
import AppMetricCard from '../components/AppMetricCard.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import WorkflowCanvasNode from '../components/WorkflowCanvasNode.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardWorkflowDefinition, DashboardWorkflowResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime } from '../utils/format'

type WorkflowTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const error = ref('')
const workflows = ref<DashboardWorkflowResponse | null>(null)
const selectedWorkflowId = ref<string | null>(null)
const canvasNodes = ref<Node[]>([])
const canvasEdges = ref<Edge[]>([])

const nodeTypes = {
  workflowCard: markRaw(WorkflowCanvasNode)
}

const toneBadgeColor: Record<WorkflowTone, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral'
}

const inspectorCardClass: Record<WorkflowTone, string> = {
  primary: 'border-primary/20 bg-primary/6',
  success: 'border-emerald-200/80 bg-emerald-500/6',
  warning: 'border-amber-200/80 bg-amber-500/6',
  error: 'border-rose-200/80 bg-rose-500/6',
  neutral: 'border-default bg-elevated/25'
}

const inspectorIndexClass: Record<WorkflowTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-emerald-500/12 text-emerald-600',
  warning: 'bg-amber-500/12 text-amber-700',
  error: 'bg-rose-500/12 text-rose-600',
  neutral: 'bg-slate-900/7 text-slate-600'
}

function resolveTone(tone?: WorkflowTone | null): WorkflowTone {
  return tone ?? 'neutral'
}

function scaleNodePosition(position?: { x: number; y: number } | null) {
  return {
    x: Math.round((position?.x ?? 0) * 0.82),
    y: Math.round((position?.y ?? 0) * 1.45)
  }
}

function buildFlowNodes(workflow: DashboardWorkflowDefinition | null): Node[] {
  return (workflow?.nodes ?? []).map((node) => ({
    ...node,
    type: 'workflowCard',
    position: scaleNodePosition(node.position),
    draggable: true,
    connectable: false,
    selectable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left
  }))
}

function buildFlowEdges(workflow: DashboardWorkflowDefinition | null): Edge[] {
  return (workflow?.edges ?? []).map((edge) => ({
    ...edge,
    type: 'smoothstep',
    animated: edge.animated ?? false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: edge.animated ? '#3b82f6' : '#94a3b8'
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      stroke: edge.animated ? 'rgba(59, 130, 246, 0.55)' : 'rgba(148, 163, 184, 0.75)',
      strokeWidth: 2.25,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    },
    labelStyle: {
      fill: '#334155',
      fontWeight: 600,
      fontSize: 12
    },
    labelShowBg: true,
    labelBgPadding: [10, 5],
    labelBgBorderRadius: 999,
    labelBgStyle: {
      fill: 'rgba(255, 255, 255, 0.92)',
      stroke: 'rgba(148, 163, 184, 0.35)',
      strokeWidth: 1
    }
  }))
}

const selectedWorkflow = computed<DashboardWorkflowDefinition | null>(() => {
  const items = workflows.value?.items ?? []
  return items.find((item) => item.id === selectedWorkflowId.value) ?? items[0] ?? null
})

const workflowMetrics = computed(() => {
  const items = workflows.value?.items ?? []
  const totalNodes = items.reduce((sum, item) => sum + item.nodes.length, 0)
  const totalEdges = items.reduce((sum, item) => sum + item.edges.length, 0)

  return [
    { label: 'Workflow tersedia', value: String(items.length), hint: 'Catalog', tone: 'primary' },
    { label: 'Node terekam', value: String(totalNodes), hint: 'Builder blocks', tone: 'success' },
    { label: 'Connection map', value: String(totalEdges), hint: 'Transitions', tone: 'warning' },
    { label: 'Terakhir refresh', value: formatDateTime(workflows.value?.generatedAt), hint: 'UTC', tone: 'neutral' }
  ] as const
})

const selectedWorkflowStats = computed(() => {
  if (!selectedWorkflow.value) {
    return []
  }

  return [
    {
      label: 'Nodes',
      value: String(selectedWorkflow.value.nodes.length),
      wrapperClass: 'border-primary/18 bg-primary/8 text-primary',
      valueClass: 'text-primary'
    },
    {
      label: 'Connections',
      value: String(selectedWorkflow.value.edges.length),
      wrapperClass: 'border-amber-200/80 bg-amber-500/8 text-amber-700',
      valueClass: 'text-amber-700'
    },
    {
      label: 'Tags',
      value: String(selectedWorkflow.value.tags.length),
      wrapperClass: 'border-slate-200/80 bg-slate-900/4 text-slate-600',
      valueClass: 'text-slate-900'
    }
  ] as const
})

watch(selectedWorkflow, (workflow) => {
  canvasNodes.value = buildFlowNodes(workflow)
  canvasEdges.value = buildFlowEdges(workflow)
}, { immediate: true })

async function loadWorkflows() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getWorkflows()

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat workflow dashboard.')
    }

    const previousSelectedId = selectedWorkflowId.value

    workflows.value = payload
    selectedWorkflowId.value = payload.items.find((item) => item.id === previousSelectedId)?.id ?? payload.items[0]?.id ?? null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat workflow dashboard.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadWorkflows()
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="workflows-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Workflow explorer"
          title="Workflow map"
          description="Lihat alur, node, dan relasi proses dalam satu tampilan."
        />

        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="primary" variant="soft">{{ workflows?.items.length ?? 0 }} workflow</UBadge>
          <UBadge color="neutral" variant="soft">Updated {{ formatDateTime(workflows?.generatedAt) }}</UBadge>
          <UButton color="neutral" variant="soft" size="lg" data-testid="workflows-refresh" @click="loadWorkflows" :loading="loading" loading-icon="">
            <template #leading>
              <AppIcon name="refresh-cw" class="size-4" />
            </template>
            Refresh workflows
          </UButton>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Workflow gagal dimuat" :description="error" />

    <div v-if="loading && !workflows" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat workflow...
    </div>

    <template v-else-if="workflows?.items.length && selectedWorkflow">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppMetricCard
          v-for="metric in workflowMetrics"
          :key="metric.label"
          :label="metric.label"
          :value="metric.value"
          :hint="metric.hint"
          :tone="metric.tone"
        />
      </section>

      <div class="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside class="rounded-3xl border border-default bg-default p-4 shadow-xs">
          <div class="flex items-start justify-between gap-3 border-b border-default pb-4">
            <div>
              <div class="text-sm font-semibold text-highlighted">Workflow catalog</div>
              <p class="mt-1 text-sm leading-6 text-muted">Daftar flow yang tersedia.</p>
            </div>
            <UBadge color="neutral" variant="soft">{{ workflows.items.length }} items</UBadge>
          </div>

          <div class="mt-4 space-y-3">
            <button
              v-for="item in workflows.items"
              :key="item.id"
              type="button"
              :data-testid="`workflow-item-${item.id}`"
              class="w-full rounded-2xl border p-4 text-left transition"
              :class="item.id === selectedWorkflow.id ? 'border-primary/30 bg-primary/6' : 'border-default bg-elevated/20 hover:bg-elevated/35'"
              @click="selectedWorkflowId = item.id"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" :class="item.id === selectedWorkflow.id ? 'bg-primary/14 text-primary' : 'bg-slate-900/6 text-slate-600'">
                    <AppIcon name="workflow" class="size-5" />
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-highlighted">{{ item.title }}</div>
                    <div class="mt-1 truncate text-xs uppercase tracking-wide text-muted">{{ item.id }}</div>
                  </div>
                </div>

                <div class="flex shrink-0 flex-col items-end gap-2">
                  <UBadge color="primary" variant="soft">{{ item.nodes.length }} nodes</UBadge>
                  <span class="text-xs text-muted">{{ item.edges.length }} links</span>
                </div>
              </div>

              <p class="mt-4 text-sm leading-6 text-muted">{{ item.summary }}</p>

              <div class="mt-4 flex flex-wrap gap-2">
                <UBadge v-for="tag in item.tags" :key="tag" color="neutral" variant="soft">{{ tag }}</UBadge>
              </div>
            </button>
          </div>
        </aside>

        <section class="overflow-hidden rounded-3xl border border-default bg-default shadow-xs">
          <div class="flex flex-col gap-4 border-b border-default bg-default px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
            <div class="space-y-3">
              <AppSectionHeading :eyebrow="selectedWorkflow.id" :title="selectedWorkflow.title" :description="selectedWorkflow.summary" />
              <div class="flex flex-wrap gap-2">
                <UBadge color="primary" variant="soft">{{ selectedWorkflow.nodes.length }} nodes</UBadge>
                <UBadge color="warning" variant="soft">{{ selectedWorkflow.edges.length }} connections</UBadge>
                <UBadge v-for="tag in selectedWorkflow.tags" :key="tag" color="neutral" variant="soft">{{ tag }}</UBadge>
              </div>
            </div>

            <div class="flex min-w-full flex-wrap items-center gap-2 xl:min-w-[320px] xl:max-w-[420px] xl:justify-end">
              <div
                v-for="stat in selectedWorkflowStats"
                :key="stat.label"
                class="inline-flex items-center gap-3 rounded-full border px-4 py-2.5"
                :class="stat.wrapperClass"
              >
                <span class="text-xs font-semibold uppercase tracking-wide">{{ stat.label }}</span>
                <span class="text-base font-semibold" :class="stat.valueClass">{{ stat.value }}</span>
              </div>
            </div>
          </div>

          <div class="p-4">
            <div class="relative h-[720px] overflow-hidden rounded-2xl border border-default bg-default">
              <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap gap-2 p-4">
                <div class="rounded-full border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-600">
                  Canvas view
                </div>
                <div class="max-w-full truncate rounded-full border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-600">
                  {{ selectedWorkflow.title }}
                </div>
                <div class="rounded-full border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-600">
                  Drag node untuk atur jarak
                </div>
              </div>

              <VueFlow
                :key="selectedWorkflow.id"
                v-model:nodes="canvasNodes"
                v-model:edges="canvasEdges"
                :node-types="nodeTypes"
                :min-zoom="0.35"
                :max-zoom="1.45"
                :nodes-draggable="true"
                :nodes-connectable="false"
                :elements-selectable="true"
                :snap-to-grid="true"
                :snap-grid="[16, 16]"
                :fit-view-on-init="true"
                :fit-view-options="{ padding: 0.28 }"
                class="h-full w-full"
              >
                <Background :gap="26" :size="1.2" pattern-color="rgba(148, 163, 184, 0.28)" />
                <MiniMap pannable zoomable class="workflow-minimap" />
                <Controls position="bottom-right" class="workflow-controls" />
              </VueFlow>
            </div>
          </div>
        </section>

        <aside class="space-y-4 rounded-3xl border border-default bg-default p-4 shadow-xs">
          <div class="flex items-start justify-between gap-3 border-b border-default pb-4">
            <div>
              <div class="text-sm font-semibold text-highlighted">Inspector</div>
              <p class="mt-1 text-sm leading-6 text-muted">Ringkasan langkah dan relasi node.</p>
            </div>
            <UBadge class="max-w-full break-all" color="primary" variant="soft">{{ selectedWorkflow.id }}</UBadge>
          </div>

          <div class="space-y-3">
            <div
              v-for="(node, index) in selectedWorkflow.nodes"
              :key="node.id"
              class="rounded-2xl border p-4"
              :class="inspectorCardClass[resolveTone(node.data.tone)]"
            >
              <div class="flex items-start gap-4">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold" :class="inspectorIndexClass[resolveTone(node.data.tone)]">
                  {{ index + 1 }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted">{{ node.data.label }}</div>
                      <div class="mt-1 text-sm leading-6 text-muted">{{ node.data.detail || 'Tanpa detail' }}</div>
                    </div>
                    <UBadge class="shrink-0" :color="toneBadgeColor[resolveTone(node.data.tone)]" variant="soft">{{ node.id }}</UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-default bg-elevated/20 p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-highlighted">Connections</div>
                <div class="mt-1 text-sm text-muted">Transisi antar node.</div>
              </div>
              <UBadge color="neutral" variant="soft">{{ selectedWorkflow.edges.length }}</UBadge>
            </div>

            <div class="mt-4 space-y-2">
              <div v-for="edge in selectedWorkflow.edges" :key="edge.id" class="flex items-center gap-3 rounded-2xl border border-default bg-default px-3 py-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <AppIcon name="workflow" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-highlighted">{{ edge.source }} → {{ edge.target }}</div>
                  <div class="mt-1 text-xs text-muted">{{ edge.label || 'Transisi langsung' }}</div>
                </div>
                <UBadge :color="edge.animated ? 'primary' : 'neutral'" variant="soft">{{ edge.animated ? 'live' : 'step' }}</UBadge>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <AppEmptyState
      v-else
      title="Workflow belum tersedia"
      description="Belum ada workflow yang bisa divisualisasikan saat ini."
    />
  </div>
</template>

<style scoped>
:deep(.vue-flow__handle) {
  opacity: 0;
  pointer-events: none;
}

:deep(.workflow-minimap) {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  overflow: hidden;
}

:deep(.workflow-controls) {
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

:deep(.workflow-controls button) {
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid rgba(226, 232, 240, 0.75);
  color: #334155;
}

:deep(.workflow-controls button:hover) {
  background: rgba(248, 250, 252, 0.98);
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
</style>
