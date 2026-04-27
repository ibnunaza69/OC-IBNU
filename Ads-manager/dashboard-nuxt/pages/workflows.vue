<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';

import AppEmptyState from '../components/AppEmptyState.vue';
import AppSectionHeading from '../components/AppSectionHeading.vue';
import WorkflowCanvasNode from '../components/WorkflowCanvasNode.vue';
import { useDashboardApi } from '../composables/useDashboardApi';
import type { DashboardWorkflowDefinition, DashboardWorkflowResponse } from '../types/dashboard';

definePageMeta({ layout: 'dashboard' });

const api = useDashboardApi();

const loading = ref(false);
const error = ref('');
const payload = ref<DashboardWorkflowResponse | null>(null);
const selected = ref<DashboardWorkflowDefinition | null>(null);

const workflows = computed(() => payload.value?.items ?? []);

async function loadWorkflows() {
  loading.value = true;
  error.value = '';

  try {
    const { response, payload: result } = await api.getWorkflows();
    if (!response.ok || !result?.ok) {
      throw new Error('Gagal memuat workflows.');
    }
    payload.value = result;
    selected.value = result.items[0] ?? null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat workflows.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadWorkflows();
});
</script>

<template>
  <div class="space-y-6 p-5 sm:p-8" data-testid="workflows-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Catalog"
          title="Workflows"
          description="Visualisasi alur workflow operasional."
        />

        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          :loading="loading"
          loading-icon=""
          data-testid="workflows-refresh"
          @click="loadWorkflows"
        >
          Refresh
        </UButton>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Workflows gagal dimuat" :description="error" />

    <template v-if="payload && workflows.length">
      <div class="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside class="rounded-2xl border border-default bg-default p-5">
          <div class="text-sm font-semibold text-highlighted">Daftar workflow</div>
          <div class="mt-4 space-y-2">
            <UButton
              v-for="item in workflows"
              :key="item.id"
              color="neutral"
              :variant="selected?.id === item.id ? 'soft' : 'ghost'"
              block
              class="justify-start"
              :data-testid="`workflow-item-${item.id}`"
              @click="selected = item"
            >
              <div class="min-w-0 text-left">
                <div class="truncate text-sm font-medium text-highlighted">{{ item.title }}</div>
                <div class="truncate text-xs text-muted">{{ item.summary }}</div>
              </div>
            </UButton>
          </div>
        </aside>

        <section class="rounded-2xl border border-default bg-default p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-highlighted">{{ selected?.title ?? 'Workflow' }}</div>
              <div class="text-sm text-muted">{{ selected?.summary ?? '' }}</div>
            </div>
          </div>

          <div class="mt-5 h-[520px] overflow-hidden rounded-2xl border border-default bg-elevated/25">
            <VueFlow
              v-if="selected"
              :nodes="selected.nodes"
              :edges="selected.edges"
              :node-types="{ default: WorkflowCanvasNode }"
              fit-view-on-init
              :min-zoom="0.2"
              :max-zoom="1.4"
              :default-viewport="{ x: 0, y: 0, zoom: 0.9 }"
            >
              <Background />
              <MiniMap />
              <Controls />
            </VueFlow>
          </div>
        </section>
      </div>
    </template>

    <AppEmptyState
      v-else-if="!loading"
      title="Workflows belum tersedia"
      description="Belum ada definisi workflow yang dapat ditampilkan."
    />

    <div v-else class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat workflows...
    </div>
  </div>
</template>

