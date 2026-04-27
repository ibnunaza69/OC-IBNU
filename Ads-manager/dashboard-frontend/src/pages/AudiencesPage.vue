<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import AppStatusBadge from '../components/AppStatusBadge.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardAudienceItem, DashboardAudienceListResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime } from '../utils/format'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const error = ref('')
const search = ref('')
const selectedType = ref<'all' | 'custom' | 'lookalike'>('custom')
const audienceList = ref<DashboardAudienceListResponse | null>(null)

function formatCount(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  return new Intl.NumberFormat('id-ID').format(value)
}

function audienceName(item: DashboardAudienceItem) {
  return item.name || item.id
}

function operationStatusLabel(item: DashboardAudienceItem) {
  return typeof item.operationStatus?.description === 'string'
    ? item.operationStatus.description
    : typeof item.operationStatus?.status === 'string'
      ? item.operationStatus.status
      : typeof item.operationStatus?.operation_status === 'string'
        ? item.operationStatus.operation_status
        : 'unknown'
}

function deliveryStatusLabel(item: DashboardAudienceItem) {
  return typeof item.deliveryStatus?.description === 'string'
    ? item.deliveryStatus.description
    : typeof item.deliveryStatus?.status === 'string'
      ? item.deliveryStatus.status
      : typeof item.deliveryStatus?.delivery_status === 'string'
        ? item.deliveryStatus.delivery_status
        : 'unknown'
}

function lookalikeSummary(item: DashboardAudienceItem) {
  const spec = item.lookalikeSpec
  if (!spec) {
    return 'Spec lookalike belum tersedia.'
  }

  const country = typeof spec.country === 'string'
    ? spec.country
    : Array.isArray(spec.origin) && spec.origin.length > 0 && typeof spec.origin[0]?.country === 'string'
      ? spec.origin[0].country
      : null

  const ratio = typeof spec.ratio === 'number'
    ? spec.ratio
    : typeof spec.starting_ratio === 'number'
      ? spec.starting_ratio
      : null

  const type = typeof spec.type === 'string' ? spec.type : null

  return [
    country ? `Country ${country}` : null,
    ratio !== null ? `Ratio ${ratio}%` : null,
    type ? `Type ${type}` : null
  ].filter(Boolean).join(' • ') || 'Spec lookalike tersedia.'
}

function compareAudiences(left: DashboardAudienceItem, right: DashboardAudienceItem) {
  const leftUpdated = left.timeUpdated ? Date.parse(left.timeUpdated) : 0
  const rightUpdated = right.timeUpdated ? Date.parse(right.timeUpdated) : 0

  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated
  }

  return audienceName(left).localeCompare(audienceName(right), 'id')
}

const audienceCounts = computed(() => {
  const items = audienceList.value?.items ?? []

  return {
    all: items.length,
    custom: items.filter((item) => item.audienceType === 'custom').length,
    lookalike: items.filter((item) => item.audienceType === 'lookalike').length
  }
})

const filteredAudiences = computed(() => {
  const keyword = search.value.trim().toLowerCase()

  return (audienceList.value?.items ?? [])
    .filter((item) => selectedType.value === 'all' || item.audienceType === selectedType.value)
    .filter((item) => {
      if (!keyword) {
        return true
      }

      return [
        item.id,
        item.name,
        item.subtype,
        item.description,
        item.rule
      ].filter(Boolean).some((value) => value!.toLowerCase().includes(keyword))
    })
    .sort(compareAudiences)
})

const approximateReachTotal = computed(() => filteredAudiences.value.reduce((sum, item) => sum + (item.approximateCount ?? 0), 0))

const metricCards = computed(() => [
  {
    label: 'Visible audiences',
    value: String(filteredAudiences.value.length),
    hint: selectedType.value === 'all' ? 'Semua tipe' : `Filter ${selectedType.value}`
  },
  {
    label: 'Approx size total',
    value: formatCount(approximateReachTotal.value),
    hint: 'Akumulasi approximate count'
  },
  {
    label: 'Custom',
    value: String(audienceCounts.value.custom),
    hint: 'Audience custom tersedia'
  },
  {
    label: 'Lookalike',
    value: String(audienceCounts.value.lookalike),
    hint: `Updated ${formatDateTime(audienceList.value?.generatedAt)}`
  }
])

async function loadAudiences() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getAudiences({ limit: 100, type: 'all' })

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat audience dashboard.')
    }

    audienceList.value = payload
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat audience dashboard.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadAudiences()
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="audiences-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Audience manager"
          title="Live audience library"
          description="Cek custom audience dan lookalike langsung dari endpoint dashboard yang sudah tersambung ke Meta."
        />

        <div class="flex flex-wrap gap-2">
          <UBadge color="primary" variant="soft">{{ audienceCounts.custom }} custom</UBadge>
          <UBadge color="warning" variant="soft">{{ audienceCounts.lookalike }} lookalike</UBadge>
          <UBadge color="neutral" variant="soft">Updated {{ formatDateTime(audienceList?.generatedAt) }}</UBadge>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Audience gagal dimuat" :description="error" />

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in metricCards" :key="card.label" class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <div class="text-sm font-medium text-muted">{{ card.label }}</div>
        <div class="mt-3 text-2xl font-semibold tracking-tight text-highlighted">{{ card.value }}</div>
        <div class="mt-2 text-sm text-muted">{{ card.hint }}</div>
      </article>
    </section>

    <section class="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <AppSectionHeading
          eyebrow="Filter"
          title="Saring audience"
          description="Mulai dari custom audience dulu, lalu pindah ke lookalike bila perlu."
        />

        <div class="mt-5 space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-toned">Cari audience</label>
            <UInput v-model="search" class="w-full" size="lg" data-testid="audiences-search" placeholder="Cari nama, ID, subtype, atau rule..." />
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton color="neutral" :variant="selectedType === 'custom' ? 'soft' : 'ghost'" size="lg" @click="selectedType = 'custom'">
              Custom
            </UButton>
            <UButton color="warning" :variant="selectedType === 'lookalike' ? 'soft' : 'ghost'" size="lg" @click="selectedType = 'lookalike'">
              Lookalike
            </UButton>
            <UButton color="primary" :variant="selectedType === 'all' ? 'soft' : 'ghost'" size="lg" @click="selectedType = 'all'">
              All
            </UButton>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadAudiences">
              Refresh audiences
            </UButton>
            <UButton color="primary" variant="soft" size="lg" :to="dashboardRoutes.campaigns">
              Ke campaigns
            </UButton>
          </div>
        </div>
      </article>

      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <AppSectionHeading
          eyebrow="Output guide"
          title="Format yang siap dipakai ke chat"
          description="Struktur ini sengaja singkat supaya gampang dibaca di grup saat nanti disambungkan ke bot."
        />

        <div class="mt-5 space-y-3 text-sm text-muted">
          <div class="rounded-2xl border border-default bg-elevated/20 p-4">
            • Nama audience<br>
            • Tipe: custom / lookalike<br>
            • Approximate count<br>
            • Retention days<br>
            • Operation status / delivery status<br>
            • Last updated
          </div>
          <div class="rounded-2xl border border-default bg-elevated/20 p-4">
            Default tampilan sekarang dibuka ke <strong>custom audience</strong>, supaya sesuai request “cek custom audience dulu”.
          </div>
        </div>
      </article>
    </section>

    <section v-if="loading && !audienceList" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat audience library...
    </section>

    <section v-else-if="filteredAudiences.length" class="grid gap-4 xl:grid-cols-2">
      <article
        v-for="item in filteredAudiences"
        :key="item.id"
        class="rounded-2xl border border-default bg-default p-5 shadow-xs"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-highlighted break-words">{{ audienceName(item) }}</h2>
            <div class="mt-1 text-sm text-muted break-all">{{ item.id }}</div>
            <p v-if="item.description" class="mt-3 text-sm leading-6 text-muted">{{ item.description }}</p>
          </div>

          <div class="flex shrink-0 flex-wrap justify-end gap-2">
            <UBadge :color="item.audienceType === 'lookalike' ? 'warning' : 'primary'" variant="soft">
              {{ item.audienceType }}
            </UBadge>
            <UBadge color="neutral" variant="soft">{{ item.subtype || 'unknown subtype' }}</UBadge>
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
          <div class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <div class="text-muted">Approximate count</div>
            <div class="mt-1 font-medium text-toned">{{ formatCount(item.approximateCount) }}</div>
          </div>
          <div class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <div class="text-muted">Retention days</div>
            <div class="mt-1 font-medium text-toned">{{ item.retentionDays ?? '—' }}</div>
          </div>
          <div class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <div class="text-muted">Updated</div>
            <div class="mt-1 font-medium text-toned">{{ formatDateTime(item.timeUpdated) }}</div>
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <div class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <div class="mb-2 text-sm text-muted">Operation status</div>
            <AppStatusBadge :value="operationStatusLabel(item)" />
          </div>
          <div class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <div class="mb-2 text-sm text-muted">Delivery status</div>
            <AppStatusBadge :value="deliveryStatusLabel(item)" />
          </div>
        </div>

        <div class="mt-4 rounded-2xl border border-default bg-elevated/20 px-4 py-3 text-sm text-muted">
          <strong class="text-highlighted">{{ item.audienceType === 'lookalike' ? 'Lookalike spec' : 'Rule info' }}:</strong>
          <span v-if="item.audienceType === 'lookalike'"> {{ lookalikeSummary(item) }}</span>
          <span v-else> {{ item.rule || 'Rule belum tersedia.' }}</span>
        </div>

        <details v-if="item.lookalikeSpec || item.rule" class="mt-4 rounded-2xl border border-default bg-default px-4 py-3 text-sm text-muted">
          <summary class="cursor-pointer font-medium text-highlighted">Lihat detail raw</summary>
          <pre class="mt-3 overflow-auto rounded-2xl bg-elevated/25 p-4 text-xs leading-6 text-toned whitespace-pre-wrap">{{ item.audienceType === 'lookalike' ? JSON.stringify(item.lookalikeSpec, null, 2) : item.rule }}</pre>
        </details>
      </article>
    </section>

    <AppEmptyState
      v-else
      title="Audience belum tersedia"
      description="Belum ada audience yang cocok dengan filter saat ini, atau data Meta belum berhasil dimuat."
    />
  </div>
</template>
