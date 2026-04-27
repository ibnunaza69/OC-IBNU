<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppEmptyState from '../components/AppEmptyState.vue';
import AppSectionHeading from '../components/AppSectionHeading.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { useDashboardApi } from '../composables/useDashboardApi';
import type { DashboardCreativeLibraryResponse } from '../types/dashboard';
import { formatDateTime } from '../utils/format';

definePageMeta({ layout: 'dashboard' });

const api = useDashboardApi();

const loading = ref(false);
const error = ref('');
const search = ref('');
const library = ref<DashboardCreativeLibraryResponse | null>(null);

const items = computed(() => {
  const list = library.value?.items ?? [];
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return list;
  }

  return list.filter((item) => {
    const haystack = [
      item.assetType,
      item.provider,
      item.status,
      item.title ?? '',
      item.providerAssetId ?? ''
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
});

async function loadLibrary() {
  loading.value = true;
  error.value = '';

  try {
    const { response, payload } = await api.getCreativeLibrary({ limit: 50, assetType: 'all' });
    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat creative library.');
    }
    library.value = payload;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat creative library.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadLibrary();
});
</script>

<template>
  <div class="space-y-6 p-5 sm:p-8" data-testid="creatives-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Library"
          title="Creatives"
          description="Library asset image/video yang dihasilkan atau terikat ke creative."
        />

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            size="lg"
            placeholder="Cari creatives..."
            class="w-full sm:w-[280px]"
            data-testid="creatives-search"
          />
          <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadLibrary">
            Refresh
          </UButton>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Creatives gagal dimuat" :description="error" />

    <div v-if="loading && !library" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat creatives...
    </div>

    <template v-else-if="library && items.length">
      <div class="rounded-2xl border border-default bg-default p-5">
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <div>Total: <span class="font-medium text-toned">{{ library.totals.total }}</span></div>
          <div>Generated: <span class="font-medium text-toned">{{ formatDateTime(library.generatedAt) }}</span></div>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="asset in items" :key="asset.id" class="rounded-2xl border border-default bg-elevated/25 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-highlighted">
                  {{ asset.title || asset.id }}
                </div>
                <div class="text-sm text-muted">{{ asset.assetType }} · {{ asset.provider }}</div>
              </div>
              <AppStatusBadge :value="asset.status" />
            </div>

            <div v-if="asset.thumbnailUrl || asset.originalUrl" class="mt-4 overflow-hidden rounded-xl border border-default bg-default">
              <img
                :src="asset.thumbnailUrl || asset.originalUrl || ''"
                :alt="asset.title || asset.id"
                class="h-36 w-full object-cover"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            </div>
          </article>
        </div>
      </div>
    </template>

    <AppEmptyState
      v-else
      title="Library belum tersedia"
      description="Belum ada asset yang dapat ditampilkan untuk filter saat ini."
    />
  </div>
</template>

