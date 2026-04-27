<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppEmptyState from '../components/AppEmptyState.vue';
import AppSectionHeading from '../components/AppSectionHeading.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { useDashboardApi } from '../composables/useDashboardApi';
import type { DashboardAudienceListResponse } from '../types/dashboard';
import { formatDateTime } from '../utils/format';

definePageMeta({ layout: 'dashboard' });

const api = useDashboardApi();

const loading = ref(false);
const error = ref('');
const filter = ref<'all' | 'custom' | 'lookalike'>('all');
const list = ref<DashboardAudienceListResponse | null>(null);

const items = computed(() => list.value?.items ?? []);

async function loadAudiences() {
  loading.value = true;
  error.value = '';

  try {
    const { response, payload } = await api.getAudiences({ type: filter.value, limit: 50 });
    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat audiences.');
    }
    list.value = payload;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat audiences.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadAudiences();
});
</script>

<template>
  <div class="space-y-6 p-5 sm:p-8" data-testid="audiences-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading eyebrow="Library" title="Audiences" description="Daftar audience untuk monitoring dan audit." />
        <div class="flex flex-wrap items-center gap-2">
          <USelect v-model="filter" size="lg" :items="['all', 'custom', 'lookalike']" />
          <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadAudiences">
            Refresh
          </UButton>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Audiences gagal dimuat" :description="error" />

    <div v-if="loading && !list" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat audiences...
    </div>

    <template v-else-if="list && items.length">
      <div class="rounded-2xl border border-default bg-default p-5">
        <div class="text-sm text-muted">Generated: <span class="font-medium text-toned">{{ formatDateTime(list.generatedAt) }}</span></div>
        <div class="mt-5 divide-y divide-default">
          <div v-for="audience in items" :key="audience.id" class="py-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-highlighted">
                  {{ audience.name || audience.id }}
                </div>
                <div class="text-sm text-muted">
                  {{ audience.audienceType }} · {{ audience.subtype || '—' }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <AppStatusBadge :value="audience.operationStatus ? 'configured' : 'unknown'" />
                <UBadge color="neutral" variant="soft">{{ audience.approximateCount ?? '—' }}</UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <AppEmptyState
      v-else
      title="Belum ada audience"
      description="Pastikan Meta provider terkoneksi dan audience tersedia pada akun."
    />
  </div>
</template>

