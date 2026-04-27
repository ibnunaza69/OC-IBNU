<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppEmptyState from '../components/AppEmptyState.vue';
import AppSectionHeading from '../components/AppSectionHeading.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { useDashboardApi } from '../composables/useDashboardApi';
import type { DashboardCampaignHierarchyResponse } from '../types/dashboard';
import { formatDateTime } from '../utils/format';

definePageMeta({ layout: 'dashboard' });

const api = useDashboardApi();

const loading = ref(false);
const error = ref('');
const search = ref('');
const hierarchy = ref<DashboardCampaignHierarchyResponse | null>(null);

const filteredCampaigns = computed(() => {
  const items = hierarchy.value?.items ?? [];
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((campaign) => {
    const haystack = [
      campaign.campaignId,
      campaign.name ?? '',
      campaign.objective ?? '',
      campaign.effectiveStatus ?? ''
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
});

async function loadHierarchy() {
  loading.value = true;
  error.value = '';

  try {
    const { response, payload } = await api.getCampaignHierarchy();
    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat hierarchy campaign.');
    }
    hierarchy.value = payload;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat hierarchy campaign.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadHierarchy();
});
</script>

<template>
  <div class="space-y-6 p-5 sm:p-8" data-testid="campaigns-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Explorer"
          title="Campaign hierarchy"
          description="Ringkasan hierarchy campaign untuk monitoring operasional."
        />

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            size="lg"
            placeholder="Cari campaign..."
            class="w-full sm:w-[280px]"
            data-testid="campaigns-search"
          />
          <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadHierarchy">
            Refresh
          </UButton>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Campaigns gagal dimuat" :description="error" />

    <div v-if="loading && !hierarchy" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat campaigns...
    </div>

    <template v-else-if="hierarchy">
      <div class="rounded-2xl border border-default bg-default p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-sm text-muted">
            Account: <span class="font-medium text-toned">{{ hierarchy.accountId }}</span>
          </div>
          <div class="text-sm text-muted">
            Freshness: <span class="font-medium text-toned">{{ formatDateTime(hierarchy.freshness.campaignsSyncedAt) }}</span>
          </div>
        </div>

        <div class="mt-5 divide-y divide-default">
          <div v-for="campaign in filteredCampaigns" :key="campaign.campaignId" class="py-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-highlighted">
                  {{ campaign.name || campaign.campaignId }}
                </div>
                <div class="text-sm text-muted">
                  {{ campaign.objective || '—' }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <AppStatusBadge :value="campaign.effectiveStatus" />
                <UBadge color="neutral" variant="soft">{{ campaign.adSetCount }} ad set</UBadge>
                <UBadge color="neutral" variant="soft">{{ campaign.adCount }} ad</UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <AppEmptyState
      v-else
      title="Belum ada data campaign"
      description="Pastikan credential Meta tersambung dan jalankan sinkronisasi."
    />
  </div>
</template>

