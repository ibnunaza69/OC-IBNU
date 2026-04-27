<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import AppStatusBadge from '../components/AppStatusBadge.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardAdDetailResponse, DashboardCampaignHierarchyResponse, DashboardMetaActionResponse, DashboardPerformanceMetrics } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime } from '../utils/format'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const loadingAdDetail = ref(false)
const syncingMeta = ref(false)
const operationLoading = ref(false)
const operationLabel = ref('')
const error = ref('')
const syncError = ref('')
const syncMessage = ref('')
const adDetailError = ref('')
const operationError = ref('')
const search = ref('')
const hierarchy = ref<DashboardCampaignHierarchyResponse | null>(null)
const adDetail = ref<DashboardAdDetailResponse | null>(null)
const operationResult = ref<DashboardMetaActionResponse | null>(null)
const operationReason = ref('Dashboard write operation')
const operationNamePrefix = ref('Copy')
const operationIncludeAds = ref(false)
const operationCleanupOnFailure = ref(true)
const operationStatusOption = ref<'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE'>('PAUSED')
const selectedCampaignId = ref<string | null>(null)
const selectedAdSetId = ref<string | null>(null)
const selectedAdId = ref<string | null>(null)

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'IDR', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
])

function toNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatCount(value?: number | null, digits = 0) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(normalized)
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  return `${new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: value < 10 ? 2 : 1,
    maximumFractionDigits: value < 10 ? 2 : 1
  }).format(value)}%`
}

function formatCurrencyValue(value?: number | null, currency?: string | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }

  const normalizedCurrency = (currency || 'IDR').toUpperCase()
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 0 : 2

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value)
}

function formatBudget(rawValue?: string | null, currency?: string | null) {
  if (!rawValue) {
    return '—'
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) {
    return rawValue
  }

  const normalizedCurrency = (currency || 'IDR').toUpperCase()
  const value = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? parsed : parsed / 100
  return formatCurrencyValue(value, normalizedCurrency)
}

function metricCards(metrics?: DashboardPerformanceMetrics | null, currency?: string | null) {
  if (!metrics) {
    return []
  }

  return [
    {
      label: metrics.budgetType === 'lifetime' ? 'Budget total' : 'Budget / hari',
      value: formatCurrencyValue(metrics.budgetAmount, currency),
      hint: metrics.budgetType ? `Budget ${metrics.budgetType}` : 'Budget tidak tersedia'
    },
    {
      label: 'Spend 30d',
      value: formatCurrencyValue(metrics.spend, currency),
      hint: 'Meta insights 30 hari'
    },
    {
      label: 'Clicks',
      value: formatCount(metrics.clicks),
      hint: `CTR ${formatPercent(metrics.ctr)}`
    },
    {
      label: metrics.resultLabel ? `Result • ${metrics.resultLabel}` : 'Result',
      value: metrics.resultCount !== null ? formatCount(metrics.resultCount, metrics.resultCount % 1 === 0 ? 0 : 2) : '—',
      hint: metrics.costPerResult !== null ? `CPR ${formatCurrencyValue(metrics.costPerResult, currency)}` : 'CPR belum tersedia'
    },
    {
      label: 'Impressions',
      value: formatCount(metrics.impressions),
      hint: `Reach ${formatCount(metrics.reach)}`
    },
    {
      label: 'CPC',
      value: formatCurrencyValue(metrics.cpc, currency),
      hint: metrics.source === 'meta-insights-last-30d' ? 'Source: Meta insights 30d' : 'Source: snapshot only'
    }
  ]
}

function statusSortWeight(status?: string | null) {
  const normalized = (status || '').toUpperCase()

  if (normalized === 'ACTIVE') {
    return 0
  }

  if (normalized.includes('ACTIVE')) {
    return 1
  }

  if (normalized.includes('PAUSED')) {
    return 2
  }

  if (normalized.includes('ARCHIVED') || normalized.includes('DELETED')) {
    return 4
  }

  return 3
}

function compareOperationalOrder(
  statusA: string | null | undefined,
  statusB: string | null | undefined,
  spendA: number | null | undefined,
  spendB: number | null | undefined,
  updatedA: string | null | undefined,
  updatedB: string | null | undefined,
  nameA: string | null | undefined,
  nameB: string | null | undefined,
  idA: string,
  idB: string
) {
  const statusDiff = statusSortWeight(statusA) - statusSortWeight(statusB)
  if (statusDiff !== 0) {
    return statusDiff
  }

  const spendDiff = toNumber(spendB) - toNumber(spendA)
  if (spendDiff !== 0) {
    return spendDiff
  }

  const updatedTimeA = updatedA ? Date.parse(updatedA) : 0
  const updatedTimeB = updatedB ? Date.parse(updatedB) : 0
  if (updatedTimeA !== updatedTimeB) {
    return updatedTimeB - updatedTimeA
  }

  const labelA = (nameA || idA).toLowerCase()
  const labelB = (nameB || idB).toLowerCase()
  return labelA.localeCompare(labelB, 'id')
}

function sortHierarchyItems(items: DashboardCampaignHierarchyResponse['items']) {
  return [...items]
    .map((campaign) => ({
      ...campaign,
      adSets: [...campaign.adSets]
        .map((adSet) => ({
          ...adSet,
          ads: [...adSet.ads].sort((left, right) => compareOperationalOrder(
            left.effectiveStatus,
            right.effectiveStatus,
            left.metrics?.spend,
            right.metrics?.spend,
            left.providerUpdatedTime ?? left.syncedAt,
            right.providerUpdatedTime ?? right.syncedAt,
            left.name,
            right.name,
            left.adId,
            right.adId
          ))
        }))
        .sort((left, right) => compareOperationalOrder(
          left.effectiveStatus,
          right.effectiveStatus,
          left.metrics?.spend,
          right.metrics?.spend,
          left.providerUpdatedTime ?? left.syncedAt,
          right.providerUpdatedTime ?? right.syncedAt,
          left.name,
          right.name,
          left.adSetId,
          right.adSetId
        ))
    }))
    .sort((left, right) => compareOperationalOrder(
      left.effectiveStatus,
      right.effectiveStatus,
      left.metrics?.spend,
      right.metrics?.spend,
      left.providerUpdatedTime ?? left.syncedAt,
      right.providerUpdatedTime ?? right.syncedAt,
      left.name,
      right.name,
      left.campaignId,
      right.campaignId
    ))
}

function applyHierarchySelection(payload: DashboardCampaignHierarchyResponse) {
  const campaigns = sortHierarchyItems(payload.items ?? [])
  const nextCampaign = campaigns.find((item) => item.campaignId === selectedCampaignId.value) ?? campaigns[0] ?? null
  selectedCampaignId.value = nextCampaign?.campaignId ?? null

  const adSets = nextCampaign?.adSets ?? []
  const nextAdSet = adSets.find((item) => item.adSetId === selectedAdSetId.value) ?? adSets[0] ?? null
  selectedAdSetId.value = nextAdSet?.adSetId ?? null

  const ads = nextAdSet?.ads ?? []
  const nextAd = ads.find((item) => item.adId === selectedAdId.value) ?? ads[0] ?? null
  selectedAdId.value = nextAd?.adId ?? null
}

const filteredCampaigns = computed(() => {
  const items = hierarchy.value?.items ?? []
  const query = search.value.trim().toLowerCase()

  const filteredItems = !query
    ? items
    : items.filter((campaign) => {
      const campaignHit = [campaign.campaignId, campaign.name, campaign.objective, campaign.metrics?.resultLabel]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))

      const adSetHit = campaign.adSets.some((adSet) => {
        const selfHit = [adSet.adSetId, adSet.name, adSet.optimizationGoal, adSet.metrics?.resultLabel]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))

        const adHit = adSet.ads.some((ad) =>
          [ad.adId, ad.name, ad.creativeId, ad.creativeName, ad.metrics?.resultLabel, ad.asset?.id, ad.asset?.title, ad.asset?.provider]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query))
        )

        return selfHit || adHit
      })

      return campaignHit || adSetHit
    })

  return sortHierarchyItems(filteredItems)
})

const selectedCampaign = computed(() => {
  const campaigns = filteredCampaigns.value
  return campaigns.find((item) => item.campaignId === selectedCampaignId.value) ?? campaigns[0] ?? null
})

const selectedAdSet = computed(() => {
  const adSets = selectedCampaign.value?.adSets ?? []
  return adSets.find((item) => item.adSetId === selectedAdSetId.value) ?? adSets[0] ?? null
})

const selectedAd = computed(() => {
  const ads = selectedAdSet.value?.ads ?? []
  return ads.find((item) => item.adId === selectedAdId.value) ?? ads[0] ?? null
})

const selectedAdCreative = computed(() => adDetail.value?.creative ?? null)
const selectedAdAsset = computed(() => adDetail.value?.asset ?? selectedAd.value?.asset ?? null)
const selectedAdPreviewType = computed(() => selectedAdCreative.value?.previewType ?? selectedAdAsset.value?.assetType ?? 'unknown')
const selectedAdPreviewImageUrl = computed(() => selectedAdCreative.value?.thumbnailUrl || selectedAdCreative.value?.imageUrl || selectedAdAsset.value?.thumbnailUrl || selectedAdAsset.value?.originalUrl || '')
const selectedAdPreviewVideoUrl = computed(() => selectedAdCreative.value?.videoUrl || (selectedAdAsset.value?.assetType === 'video' ? selectedAdAsset.value?.originalUrl || '' : ''))
const operationReasonReady = computed(() => operationReason.value.trim().length >= 5)
const operationResultJson = computed(() => operationResult.value ? JSON.stringify(operationResult.value, null, 2) : '')
const currencyCode = computed(() => hierarchy.value?.currency || 'IDR')
const hierarchyFreshness = computed(() => hierarchy.value?.freshness ?? null)

const summaryCards = computed(() => {
  const items = filteredCampaigns.value
  const campaignCount = items.length
  const activeCampaignCount = items.filter((item) => (item.effectiveStatus ?? '').toLowerCase() === 'active').length
  const totalBudget = items.reduce((sum, campaign) => sum + toNumber(campaign.metrics?.budgetAmount), 0)
  const totalSpend = items.reduce((sum, campaign) => sum + toNumber(campaign.metrics?.spend), 0)
  const totalClicks = items.reduce((sum, campaign) => sum + toNumber(campaign.metrics?.clicks), 0)
  const totalImpressions = items.reduce((sum, campaign) => sum + toNumber(campaign.metrics?.impressions), 0)
  const totalResults = items.reduce((sum, campaign) => sum + toNumber(campaign.metrics?.resultCount), 0)
  const aggregateCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
  const aggregateCpr = totalResults > 0 ? totalSpend / totalResults : null

  return [
    { label: 'Visible campaigns', value: formatCount(campaignCount), hint: `${formatCount(activeCampaignCount)} aktif` },
    { label: 'Budget / hari', value: formatCurrencyValue(totalBudget, currencyCode.value), hint: 'Akumulasi snapshot visible' },
    { label: 'Spend 30d', value: formatCurrencyValue(totalSpend, currencyCode.value), hint: 'Meta insights 30 hari' },
    { label: 'Clicks', value: formatCount(totalClicks), hint: `CTR ${formatPercent(aggregateCtr)}` },
    { label: 'Impressions', value: formatCount(totalImpressions), hint: 'Dari hierarchy visible' },
    { label: 'Result / CPR', value: formatCount(totalResults), hint: aggregateCpr !== null ? `CPR ${formatCurrencyValue(aggregateCpr, currencyCode.value)}` : 'CPR belum tersedia' }
  ]
})

const selectedCampaignMetricCards = computed(() => metricCards(selectedCampaign.value?.metrics, currencyCode.value))
const selectedAdSetMetricCards = computed(() => metricCards(selectedAdSet.value?.metrics, currencyCode.value))
const selectedAdMetricCards = computed(() => metricCards(selectedAd.value?.metrics, currencyCode.value))

watch(selectedCampaign, (campaign) => {
  if (!campaign) {
    selectedAdSetId.value = null
    selectedAdId.value = null
    return
  }

  if (!campaign.adSets.find((item) => item.adSetId === selectedAdSetId.value)) {
    selectedAdSetId.value = campaign.adSets[0]?.adSetId ?? null
  }
})

watch(selectedAdSet, (adSet) => {
  if (!adSet) {
    selectedAdId.value = null
    return
  }

  if (!adSet.ads.find((item) => item.adId === selectedAdId.value)) {
    selectedAdId.value = adSet.ads[0]?.adId ?? null
  }
})

let adDetailRequestKey = 0

async function loadAdDetail(adId: string) {
  const requestKey = ++adDetailRequestKey
  loadingAdDetail.value = true
  adDetailError.value = ''
  adDetail.value = null

  try {
    const { response, payload } = await api.getAdDetail(adId)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Gagal memuat detail ad.')
    }

    if (requestKey !== adDetailRequestKey) {
      return
    }

    adDetail.value = payload
  } catch (err) {
    if (requestKey !== adDetailRequestKey) {
      return
    }

    adDetail.value = null
    adDetailError.value = err instanceof Error ? err.message : 'Gagal memuat detail ad.'
  } finally {
    if (requestKey === adDetailRequestKey) {
      loadingAdDetail.value = false
    }
  }
}

async function runDashboardAction(
  label: string,
  executor: () => Promise<{ response: Response; payload: DashboardMetaActionResponse | null }>,
  options: { refreshHierarchy?: boolean; refreshAdDetail?: boolean } = {}
) {
  if (!operationReasonReady.value) {
    operationError.value = 'Reason minimal 5 karakter.'
    return
  }

  operationLoading.value = true
  operationLabel.value = label
  operationError.value = ''
  operationResult.value = null

  try {
    const { response, payload } = await executor()

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || `Gagal menjalankan ${label}.`)
    }

    operationResult.value = payload

    if (options.refreshHierarchy) {
      await loadHierarchy()
    }

    if (options.refreshAdDetail && selectedAd.value?.adId) {
      await loadAdDetail(selectedAd.value.adId)
    }
  } catch (err) {
    operationError.value = err instanceof Error ? err.message : `Gagal menjalankan ${label}.`
  } finally {
    operationLoading.value = false
  }
}

async function previewDuplicateCampaign() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('preview duplicate campaign', () => api.duplicateCampaign(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: true,
    statusOption: operationStatusOption.value,
    deepCopy: false,
    confirmHighImpact: false
  }))
}

async function duplicateCampaignLive() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('duplicate campaign', () => api.duplicateCampaign(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: false,
    statusOption: operationStatusOption.value,
    deepCopy: false,
    confirmHighImpact: operationStatusOption.value === 'ACTIVE'
  }), { refreshHierarchy: true })
}

async function previewDuplicateCampaignTree() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('preview duplicate campaign tree', () => api.duplicateCampaignTree(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: true,
    statusOption: operationStatusOption.value,
    includeAds: operationIncludeAds.value,
    cleanupOnFailure: operationCleanupOnFailure.value,
    namePrefix: operationNamePrefix.value || undefined,
    confirmHighImpact: false
  }))
}

async function duplicateCampaignTreeLive() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('duplicate campaign tree', () => api.duplicateCampaignTree(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: false,
    statusOption: operationStatusOption.value,
    includeAds: operationIncludeAds.value,
    cleanupOnFailure: operationCleanupOnFailure.value,
    namePrefix: operationNamePrefix.value || undefined,
    confirmHighImpact: true
  }), { refreshHierarchy: true })
}

async function previewDeleteCampaign() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('preview delete campaign', () => api.deleteCampaign(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: true
  }))
}

async function deleteCampaignLive() {
  if (!selectedCampaign.value) {
    return
  }

  await runDashboardAction('delete campaign', () => api.deleteCampaign(selectedCampaign.value!.campaignId, {
    reason: operationReason.value,
    dryRun: false
  }), { refreshHierarchy: true, refreshAdDetail: true })
}

async function previewDuplicateAdSet() {
  if (!selectedAdSet.value) {
    return
  }

  await runDashboardAction('preview duplicate ad set', () => api.duplicateAdSet(selectedAdSet.value!.adSetId, {
    reason: operationReason.value,
    dryRun: true,
    targetCampaignId: selectedCampaign.value?.campaignId,
    statusOption: operationStatusOption.value,
    deepCopy: false,
    confirmHighImpact: false
  }))
}

async function duplicateAdSetLive() {
  if (!selectedAdSet.value) {
    return
  }

  await runDashboardAction('duplicate ad set', () => api.duplicateAdSet(selectedAdSet.value!.adSetId, {
    reason: operationReason.value,
    dryRun: false,
    targetCampaignId: selectedCampaign.value?.campaignId,
    statusOption: operationStatusOption.value,
    deepCopy: false,
    confirmHighImpact: operationStatusOption.value === 'ACTIVE'
  }), { refreshHierarchy: true })
}

async function previewDeleteAdSet() {
  if (!selectedAdSet.value) {
    return
  }

  await runDashboardAction('preview delete ad set', () => api.deleteAdSet(selectedAdSet.value!.adSetId, {
    reason: operationReason.value,
    dryRun: true
  }))
}

async function deleteAdSetLive() {
  if (!selectedAdSet.value) {
    return
  }

  await runDashboardAction('delete ad set', () => api.deleteAdSet(selectedAdSet.value!.adSetId, {
    reason: operationReason.value,
    dryRun: false
  }), { refreshHierarchy: true, refreshAdDetail: true })
}

async function inspectSelectedAdPromotability() {
  if (!selectedAd.value) {
    return
  }

  operationLoading.value = true
  operationLabel.value = 'inspect ad promotability'
  operationError.value = ''
  operationResult.value = null

  try {
    const { response, payload } = await api.inspectAdPromotability(selectedAd.value.adId, {
      targetAdSetId: selectedAdSet.value?.adSetId
    })

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Gagal inspect promotability ad.')
    }

    operationResult.value = payload
  } catch (err) {
    operationError.value = err instanceof Error ? err.message : 'Gagal inspect promotability ad.'
  } finally {
    operationLoading.value = false
  }
}

async function preflightDuplicateSelectedAd() {
  if (!selectedAd.value) {
    return
  }

  await runDashboardAction('preflight duplicate ad', () => api.preflightDuplicateAd(selectedAd.value!.adId, {
    reason: operationReason.value,
    targetAdSetId: selectedAdSet.value?.adSetId,
    statusOption: operationStatusOption.value,
    dryRun: true,
    confirmHighImpact: false
  }))
}

async function duplicateAdLive() {
  if (!selectedAd.value) {
    return
  }

  await runDashboardAction('duplicate ad', () => api.duplicateAd(selectedAd.value!.adId, {
    reason: operationReason.value,
    dryRun: false,
    targetAdSetId: selectedAdSet.value?.adSetId,
    statusOption: operationStatusOption.value,
    confirmHighImpact: operationStatusOption.value === 'ACTIVE'
  }), { refreshHierarchy: true, refreshAdDetail: true })
}

watch(selectedAd, (ad) => {
  if (!ad) {
    adDetail.value = null
    adDetailError.value = ''
    loadingAdDetail.value = false
    return
  }

  void loadAdDetail(ad.adId)
}, { immediate: true })

async function loadHierarchy() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getCampaignHierarchy(80)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat hierarchy campaign.')
    }

    hierarchy.value = payload
    applyHierarchySelection(payload)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat hierarchy campaign.'
  } finally {
    loading.value = false
  }
}

async function syncHierarchyFromMeta() {
  syncingMeta.value = true
  syncError.value = ''
  syncMessage.value = ''

  try {
    const { response, payload } = await api.syncCampaignHierarchy(80)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal sync hierarchy langsung dari Meta.')
    }

    syncMessage.value = `Sync selesai: ${formatCount(payload.totals.campaigns)} campaign, ${formatCount(payload.totals.adSets)} ad set, ${formatCount(payload.totals.ads)} ad.`
    await loadHierarchy()

    if (selectedAd.value?.adId) {
      await loadAdDetail(selectedAd.value.adId)
    }
  } catch (err) {
    syncError.value = err instanceof Error ? err.message : 'Gagal sync hierarchy langsung dari Meta.'
  } finally {
    syncingMeta.value = false
  }
}

onMounted(() => {
  void loadHierarchy()
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="campaigns-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Campaign explorer"
          title="Campaign hierarchy"
          description="Pantau campaign, ad set, dan ad dalam satu halaman."
        />
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="soft" size="lg" @click="loadHierarchy" :loading="loading" loading-icon="">Refresh snapshot</UButton>
          <UButton color="primary" variant="solid" size="lg" @click="syncHierarchyFromMeta" :loading="syncingMeta" loading-icon="">Sync Meta</UButton>
          <UButton color="primary" variant="soft" size="lg" :to="dashboardRoutes.overview">Kembali ke overview</UButton>
        </div>
      </div>

      <div class="mt-5 grid gap-3 lg:grid-cols-4">
        <div class="rounded-2xl border border-default bg-default/80 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted">Data source</div>
          <div class="mt-1 font-medium text-toned">Snapshot lokal + Meta insights {{ hierarchy?.performanceWindow === 'last_30d' ? '30d' : hierarchy?.performanceWindow || '—' }}</div>
        </div>
        <div class="rounded-2xl border border-default bg-default/80 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted">Last campaign sync</div>
          <div class="mt-1 font-medium text-toned">{{ formatDateTime(hierarchyFreshness?.campaignsSyncedAt) }}</div>
        </div>
        <div class="rounded-2xl border border-default bg-default/80 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted">Last ad set sync</div>
          <div class="mt-1 font-medium text-toned">{{ formatDateTime(hierarchyFreshness?.adSetsSyncedAt) }}</div>
        </div>
        <div class="rounded-2xl border border-default bg-default/80 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted">Last ad sync</div>
          <div class="mt-1 font-medium text-toned">{{ formatDateTime(hierarchyFreshness?.adsSyncedAt) }}</div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <article v-for="card in summaryCards" :key="card.label" class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <div class="text-sm font-medium text-muted">{{ card.label }}</div>
        <div class="mt-3 text-2xl font-semibold text-highlighted">{{ card.value }}</div>
        <div class="mt-2 text-sm text-muted">{{ card.hint }}</div>
      </article>
    </section>

    <section class="rounded-2xl border border-default bg-default p-4 shadow-xs">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div class="space-y-2">
          <label class="text-sm font-medium text-toned">Cari campaign / ad set / ad</label>
          <UInput v-model="search" class="w-full" size="lg" data-testid="campaigns-search" placeholder="Cari nama, ID, objective, atau creative..." />
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge color="neutral" variant="soft">{{ filteredCampaigns.length }} campaign terlihat</UBadge>
          <UBadge color="primary" variant="soft">Currency {{ currencyCode }}</UBadge>
        </div>
      </div>
    </section>

    <UAlert v-if="syncMessage" color="success" variant="soft" title="Sync Meta selesai" :description="syncMessage" />
    <UAlert v-if="syncError" color="error" variant="soft" title="Sync Meta gagal" :description="syncError" />
    <UAlert v-if="error" color="error" variant="soft" title="Campaign explorer gagal dimuat" :description="error" />

    <div v-if="loading && !hierarchy" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat campaign explorer...
    </div>

    <div v-else-if="filteredCampaigns.length" class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside class="rounded-2xl border border-default bg-default p-4 shadow-xs">
        <div class="space-y-3">
          <button
            v-for="campaign in filteredCampaigns"
            :key="campaign.campaignId"
            type="button"
            class="w-full rounded-2xl border p-4 text-left transition"
            :class="campaign.campaignId === selectedCampaign?.campaignId ? 'border-primary/40 bg-primary/8' : 'border-default bg-elevated/20 hover:bg-elevated/35'"
            @click="selectedCampaignId = campaign.campaignId"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-highlighted break-words">{{ campaign.name || campaign.campaignId }}</div>
                <div class="mt-1 text-sm text-muted break-all">{{ campaign.campaignId }}</div>
              </div>
              <AppStatusBadge class="shrink-0" :value="campaign.effectiveStatus" />
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <UBadge color="neutral" variant="soft">{{ campaign.objective || 'No objective' }}</UBadge>
              <UBadge color="primary" variant="soft">{{ campaign.adSetCount }} ad set</UBadge>
              <UBadge color="warning" variant="soft">{{ campaign.adCount }} ad</UBadge>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <div class="text-xs uppercase tracking-wide text-muted">Budget / hari</div>
                <div class="mt-1 text-sm font-semibold text-toned">{{ formatBudget(campaign.dailyBudget, currencyCode) }}</div>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <div class="text-xs uppercase tracking-wide text-muted">Spend 30d</div>
                <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(campaign.metrics.spend, currencyCode) }}</div>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <div class="text-xs uppercase tracking-wide text-muted">Clicks</div>
                <div class="mt-1 text-sm font-semibold text-toned">{{ formatCount(campaign.metrics.clicks) }}</div>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <div class="text-xs uppercase tracking-wide text-muted">CPR</div>
                <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(campaign.metrics.costPerResult, currencyCode) }}</div>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <section v-if="selectedCampaign" class="space-y-4">
        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-xl font-semibold text-highlighted break-words">{{ selectedCampaign.name || selectedCampaign.campaignId }}</h2>
                <AppStatusBadge :value="selectedCampaign.effectiveStatus" />
              </div>
              <div class="mt-1 text-sm text-muted break-all">{{ selectedCampaign.campaignId }}</div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge color="neutral" variant="soft">{{ selectedCampaign.objective || 'No objective' }}</UBadge>
              <UBadge color="primary" variant="soft">{{ selectedCampaign.adSetCount }} ad set</UBadge>
              <UBadge color="warning" variant="soft">{{ selectedCampaign.adCount }} ad</UBadge>
              <UBadge color="neutral" variant="soft">Budget {{ formatBudget(selectedCampaign.dailyBudget, currencyCode) }}</UBadge>
              <UBadge color="primary" variant="soft">Source {{ selectedCampaign.metrics.source === 'meta-insights-last-30d' ? 'Meta 30d' : 'Snapshot only' }}</UBadge>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div v-for="card in selectedCampaignMetricCards" :key="`campaign-${card.label}`" class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
              <div class="text-muted">{{ card.label }}</div>
              <div class="mt-1 text-lg font-semibold text-highlighted">{{ card.value }}</div>
              <div class="mt-1 text-sm text-muted">{{ card.hint }}</div>
            </div>
          </div>
        </article>

        <div class="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)]">
          <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
            <div class="text-sm font-semibold text-highlighted">Ad sets</div>
            <div class="mt-4 space-y-3">
              <button
                v-for="adSet in selectedCampaign.adSets"
                :key="adSet.adSetId"
                type="button"
                class="w-full rounded-2xl border p-4 text-left transition"
                :class="adSet.adSetId === selectedAdSet?.adSetId ? 'border-primary/40 bg-primary/8' : 'border-default bg-elevated/20 hover:bg-elevated/35'"
                @click="selectedAdSetId = adSet.adSetId"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-highlighted break-words">{{ adSet.name || adSet.adSetId }}</div>
                    <div class="mt-1 text-sm text-muted break-all">{{ adSet.adSetId }}</div>
                  </div>
                  <AppStatusBadge class="shrink-0" :value="adSet.effectiveStatus" />
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UBadge color="neutral" variant="soft">{{ adSet.optimizationGoal || 'No optimization goal' }}</UBadge>
                  <UBadge color="primary" variant="soft">{{ adSet.ads.length }} ad</UBadge>
                </div>
                <div class="mt-4 grid gap-2 sm:grid-cols-2">
                  <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                    <div class="text-xs uppercase tracking-wide text-muted">Budget / hari</div>
                    <div class="mt-1 text-sm font-semibold text-toned">{{ formatBudget(adSet.dailyBudget, currencyCode) }}</div>
                  </div>
                  <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                    <div class="text-xs uppercase tracking-wide text-muted">Spend 30d</div>
                    <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(adSet.metrics.spend, currencyCode) }}</div>
                  </div>
                </div>
              </button>
            </div>
          </article>

          <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
            <div v-if="selectedAdSet" class="space-y-4">
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-highlighted break-words">{{ selectedAdSet.name || selectedAdSet.adSetId }}</h3>
                    <AppStatusBadge :value="selectedAdSet.effectiveStatus" />
                  </div>
                  <div class="mt-1 text-sm text-muted break-all">{{ selectedAdSet.adSetId }}</div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UBadge color="neutral" variant="soft">{{ selectedAdSet.optimizationGoal || 'No optimization goal' }}</UBadge>
                  <UBadge color="primary" variant="soft">{{ selectedAdSet.ads.length }} ad</UBadge>
                  <UBadge color="neutral" variant="soft">Budget {{ formatBudget(selectedAdSet.dailyBudget, currencyCode) }}</UBadge>
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div v-for="card in selectedAdSetMetricCards" :key="`adset-${card.label}`" class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                  <div class="text-muted">{{ card.label }}</div>
                  <div class="mt-1 text-lg font-semibold text-highlighted">{{ card.value }}</div>
                  <div class="mt-1 text-sm text-muted">{{ card.hint }}</div>
                </div>
              </div>

              <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div class="space-y-3">
                  <div
                    v-for="ad in selectedAdSet.ads"
                    :key="ad.adId"
                    class="rounded-2xl border p-4 transition cursor-pointer"
                    :class="ad.adId === selectedAd?.adId ? 'border-primary/40 bg-primary/8' : 'border-default bg-elevated/20 hover:bg-elevated/35'"
                    @click="selectedAdId = ad.adId"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="text-sm font-semibold text-highlighted break-words">{{ ad.name || ad.adId }}</div>
                        <div class="mt-1 text-sm text-muted break-all">{{ ad.adId }}</div>
                      </div>
                      <AppStatusBadge class="shrink-0" :value="ad.effectiveStatus" />
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <UBadge class="max-w-full break-all" color="neutral" variant="soft">Creative {{ ad.creativeId || '—' }}</UBadge>
                      <UBadge class="max-w-full break-all" color="neutral" variant="soft">{{ ad.creativeName || 'No creative name' }}</UBadge>
                      <UBadge v-if="ad.asset" color="primary" variant="soft">
                        Asset {{ ad.asset.assetType || 'linked' }}
                      </UBadge>
                    </div>
                    <div class="mt-4 grid gap-2 sm:grid-cols-2">
                      <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                        <div class="text-xs uppercase tracking-wide text-muted">Spend 30d</div>
                        <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(ad.metrics.spend, currencyCode) }}</div>
                      </div>
                      <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                        <div class="text-xs uppercase tracking-wide text-muted">CPC</div>
                        <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(ad.metrics.cpc, currencyCode) }}</div>
                      </div>
                      <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                        <div class="text-xs uppercase tracking-wide text-muted">CTR</div>
                        <div class="mt-1 text-sm font-semibold text-toned">{{ formatPercent(ad.metrics.ctr) }}</div>
                      </div>
                      <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                        <div class="text-xs uppercase tracking-wide text-muted">CPR</div>
                        <div class="mt-1 text-sm font-semibold text-toned">{{ formatCurrencyValue(ad.metrics.costPerResult, currencyCode) }}</div>
                      </div>
                    </div>
                  </div>

                  <AppEmptyState
                    v-if="!selectedAdSet.ads.length"
                    title="Belum ada ad"
                    description="Ad set ini belum memiliki ad pada snapshot saat ini."
                  />
                </div>

                <div class="rounded-2xl border border-default bg-elevated/20 p-4">
                  <div class="text-sm font-semibold text-highlighted">Detail ad terpilih</div>
                  <div v-if="selectedAd" class="mt-4 space-y-3 text-sm">
                    <UAlert
                      v-if="adDetailError"
                      color="warning"
                      variant="soft"
                      title="Preview creative belum bisa dimuat"
                      :description="adDetailError"
                    />

                    <div v-if="loadingAdDetail" class="rounded-2xl border border-default bg-default px-4 py-3 text-muted">
                      Memuat preview creative dan asset...
                    </div>

                    <div v-else-if="selectedAdCreative || selectedAdAsset" class="rounded-2xl border border-default bg-default p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="text-muted">Preview creative</div>
                        <UBadge color="primary" variant="soft">{{ selectedAdPreviewType }}</UBadge>
                      </div>

                      <div class="mt-3 overflow-hidden rounded-2xl border border-default bg-elevated/20">
                        <video
                          v-if="selectedAdPreviewType === 'video' && selectedAdPreviewVideoUrl"
                          :src="selectedAdPreviewVideoUrl"
                          :poster="selectedAdPreviewImageUrl || undefined"
                          controls
                          playsinline
                          preload="metadata"
                          class="h-52 w-full bg-black object-cover"
                        />
                        <img
                          v-else-if="selectedAdPreviewImageUrl"
                          :src="selectedAdPreviewImageUrl"
                          :alt="selectedAdCreative?.name || selectedAdAsset?.title || selectedAd.name || selectedAd.adId"
                          class="h-52 w-full object-cover"
                        />
                        <div v-else class="flex h-40 items-center justify-center px-4 text-center text-sm text-muted">
                          Preview creative belum tersedia.
                        </div>
                      </div>

                      <div class="mt-3 grid gap-3 sm:grid-cols-2">
                        <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Creative source</div>
                          <div class="mt-1 font-medium text-toned">{{ selectedAdCreative?.source || 'linked-asset' }}</div>
                        </div>
                        <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Object type</div>
                          <div class="mt-1 font-medium text-toned">{{ selectedAdCreative?.objectType || '—' }}</div>
                        </div>
                      </div>

                      <div v-if="selectedAdCreative?.headline || selectedAdCreative?.body || selectedAdCreative?.description" class="mt-3 space-y-3">
                        <div v-if="selectedAdCreative?.headline" class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Headline</div>
                          <div class="mt-1 font-medium text-highlighted">{{ selectedAdCreative.headline }}</div>
                        </div>
                        <div v-if="selectedAdCreative?.body" class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Body</div>
                          <div class="mt-1 leading-6 text-toned">{{ selectedAdCreative.body }}</div>
                        </div>
                        <div v-if="selectedAdCreative?.description" class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Description</div>
                          <div class="mt-1 leading-6 text-toned">{{ selectedAdCreative.description }}</div>
                        </div>
                      </div>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <div v-for="card in selectedAdMetricCards" :key="`ad-${card.label}`" class="rounded-2xl border border-default bg-default px-4 py-3">
                        <div class="text-muted">{{ card.label }}</div>
                        <div class="mt-1 text-lg font-semibold text-highlighted">{{ card.value }}</div>
                        <div class="mt-1 text-sm text-muted">{{ card.hint }}</div>
                      </div>
                    </div>

                    <div v-if="selectedAdAsset" class="rounded-2xl border border-default bg-default p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="text-muted">Linked internal asset</div>
                        <UBadge color="primary" variant="soft">{{ selectedAdAsset.assetType || 'linked' }}</UBadge>
                      </div>

                      <div class="mt-3 grid gap-3">
                        <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                          <div class="text-muted">Asset ID</div>
                          <div class="mt-1 font-medium text-toned break-all">{{ selectedAdAsset.id || '—' }}</div>
                        </div>
                        <div class="grid gap-3 sm:grid-cols-2">
                          <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                            <div class="text-muted">Provider</div>
                            <div class="mt-1 font-medium text-toned">{{ selectedAdAsset.provider || '—' }}</div>
                          </div>
                          <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
                            <div class="text-muted">Source</div>
                            <div class="mt-1 font-medium text-toned">{{ selectedAdAsset.source }}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div v-else-if="!loadingAdDetail" class="rounded-2xl border border-dashed border-default bg-default px-4 py-3 text-muted">
                      Belum ada asset internal yang terhubung ke ad ini.
                    </div>

                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Nama</div>
                      <div class="mt-1 font-medium text-highlighted break-words">{{ selectedAd.name || selectedAd.adId }}</div>
                    </div>
                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Status</div>
                      <div class="mt-1"><AppStatusBadge :value="selectedAd.effectiveStatus" /></div>
                    </div>
                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Creative ID</div>
                      <div class="mt-1 font-medium text-toned break-all">{{ selectedAd.creativeId || '—' }}</div>
                    </div>
                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Creative name</div>
                      <div class="mt-1 font-medium text-toned break-words">{{ selectedAd.creativeName || '—' }}</div>
                    </div>
                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Last synced</div>
                      <div class="mt-1 font-medium text-toned">{{ formatDateTime(selectedAd.syncedAt) }}</div>
                    </div>
                    <div class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Meta updated</div>
                      <div class="mt-1 font-medium text-toned">{{ formatDateTime(selectedAd.providerUpdatedTime) }}</div>
                    </div>
                    <div v-if="selectedAdCreative?.linkUrl" class="rounded-2xl border border-default bg-default px-4 py-3">
                      <div class="text-muted">Destination link</div>
                      <a :href="selectedAdCreative.linkUrl" target="_blank" rel="noreferrer" class="mt-1 block break-all font-medium text-primary hover:underline">
                        {{ selectedAdCreative.linkUrl }}
                      </a>
                    </div>
                  </div>
                  <AppEmptyState
                    v-else
                    title="Pilih ad"
                    description="Klik salah satu ad untuk melihat detail singkatnya di panel ini."
                  />
                </div>
              </div>
            </div>

            <AppEmptyState
              v-else
              title="Belum ada ad set"
              description="Campaign ini belum punya ad set pada snapshot saat ini."
            />
          </article>
        </div>

        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs" data-testid="campaign-write-ops">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div class="text-sm font-semibold text-highlighted">Write operations</div>
              <p class="mt-1 text-sm text-muted">
                Duplicate, cleanup, dan preflight dari dashboard.
              </p>
            </div>
            <UBadge color="warning" variant="soft">Default rollout: PAUSED</UBadge>
          </div>

          <div class="mt-4 grid gap-3 xl:grid-cols-4">
            <div class="space-y-2 xl:col-span-2">
              <label class="text-sm font-medium text-toned">Reason audit</label>
              <UInput v-model="operationReason" class="w-full" size="lg" data-testid="campaign-write-reason" placeholder="Contoh: Dashboard operator duplicate for QA" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Status target</label>
              <USelect
                v-model="operationStatusOption"
                class="w-full"
                size="lg"
                :items="[
                  { label: 'PAUSED', value: 'PAUSED' },
                  { label: 'ACTIVE', value: 'ACTIVE' },
                  { label: 'INHERITED_FROM_SOURCE', value: 'INHERITED_FROM_SOURCE' }
                ]"
                value-key="value"
                label-key="label"
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Prefix copy tree</label>
              <UInput v-model="operationNamePrefix" class="w-full" size="lg" placeholder="Copy" />
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-toned">Include ads in tree</div>
                  <div class="mt-1 text-sm text-muted">Kalau off, duplicate tree berhenti di campaign + ad set.</div>
                </div>
                <UToggle v-model="operationIncludeAds" />
              </div>
            </div>
            <div class="rounded-2xl border border-default bg-elevated/15 px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-toned">Cleanup on failure</div>
                  <div class="mt-1 text-sm text-muted">Rollback tree hasil copy kalau step berikutnya gagal.</div>
                </div>
                <UToggle v-model="operationCleanupOnFailure" />
              </div>
            </div>
          </div>

          <UAlert
            v-if="!operationReasonReady"
            class="mt-4"
            color="warning"
            variant="soft"
            title="Reason masih kurang"
            description="Isi reason minimal 5 karakter supaya audit trail dan approval flow tetap rapi."
          />

          <UAlert
            v-if="operationError"
            class="mt-4"
            color="error"
            variant="soft"
            title="Operasi gagal"
            :description="operationError"
          />

          <div class="mt-5 grid gap-4 xl:grid-cols-3">
            <section class="rounded-2xl border border-default bg-elevated/10 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-highlighted">Campaign</div>
                  <div class="mt-1 text-sm text-muted break-all">{{ selectedCampaign.campaignId }}</div>
                </div>
                <AppStatusBadge :value="selectedCampaign.effectiveStatus" />
              </div>
              <div class="mt-4 grid gap-2 sm:grid-cols-2">
                <UButton color="neutral" variant="soft" size="lg" data-testid="campaign-preview-duplicate" :disabled="operationLoading || !operationReasonReady" @click="previewDuplicateCampaign">Preview duplicate</UButton>
                <UButton color="primary" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady" @click="duplicateCampaignLive">Live duplicate</UButton>
                <UButton color="neutral" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady" @click="previewDuplicateCampaignTree">Preview tree</UButton>
                <UButton color="primary" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady" @click="duplicateCampaignTreeLive">Live tree</UButton>
                <UButton color="warning" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady" @click="previewDeleteCampaign">Preview delete</UButton>
                <UButton color="error" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady" @click="deleteCampaignLive">Live delete</UButton>
              </div>
            </section>

            <section class="rounded-2xl border border-default bg-elevated/10 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-highlighted">Ad set</div>
                  <div class="mt-1 text-sm text-muted break-all">{{ selectedAdSet?.adSetId || 'Pilih ad set dulu' }}</div>
                </div>
                <AppStatusBadge :value="selectedAdSet?.effectiveStatus" />
              </div>
              <div class="mt-4 grid gap-2 sm:grid-cols-2">
                <UButton color="neutral" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAdSet" @click="previewDuplicateAdSet">Preview duplicate</UButton>
                <UButton color="primary" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAdSet" @click="duplicateAdSetLive">Live duplicate</UButton>
                <UButton color="warning" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAdSet" @click="previewDeleteAdSet">Preview delete</UButton>
                <UButton color="error" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAdSet" @click="deleteAdSetLive">Live delete</UButton>
              </div>
            </section>

            <section class="rounded-2xl border border-default bg-elevated/10 p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-highlighted">Ad</div>
                  <div class="mt-1 text-sm text-muted break-all">{{ selectedAd?.adId || 'Pilih ad dulu' }}</div>
                </div>
                <AppStatusBadge :value="selectedAd?.effectiveStatus" />
              </div>
              <div class="mt-4 grid gap-2">
                <UButton color="neutral" variant="soft" size="lg" data-testid="ad-inspect-promotability" :disabled="operationLoading || !selectedAd" @click="inspectSelectedAdPromotability">Inspect promotability</UButton>
                <UButton color="warning" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAd" @click="preflightDuplicateSelectedAd">Preflight duplicate</UButton>
                <UButton color="primary" variant="soft" size="lg" :disabled="operationLoading || !operationReasonReady || !selectedAd" @click="duplicateAdLive">Live duplicate</UButton>
              </div>
            </section>
          </div>

          <div class="mt-5 rounded-2xl border border-default bg-elevated/10 p-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="text-sm font-semibold text-highlighted">Operation result</div>
                <div class="mt-1 text-sm text-muted">
                  <span v-if="operationLoading">Menjalankan {{ operationLabel || 'operasi' }}...</span>
                  <span v-else-if="operationLabel">Terakhir: {{ operationLabel }}</span>
                  <span v-else>Belum ada operasi dijalankan di sesi ini.</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge v-if="operationResult?.action" color="primary" variant="soft">{{ operationResult.action }}</UBadge>
                <UBadge v-if="operationResult?.mode" color="neutral" variant="soft">{{ operationResult.mode }}</UBadge>
                <UBadge v-if="operationResult?.status" color="warning" variant="soft">{{ operationResult.status }}</UBadge>
              </div>
            </div>

            <div v-if="operationResult" class="mt-4 space-y-3">
              <div class="grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl border border-default bg-default px-4 py-3">
                  <div class="text-muted">Copied campaign</div>
                  <div class="mt-1 font-medium text-toned break-all">{{ operationResult.copiedCampaignId || '—' }}</div>
                </div>
                <div class="rounded-2xl border border-default bg-default px-4 py-3">
                  <div class="text-muted">Copied ad set</div>
                  <div class="mt-1 font-medium text-toned break-all">{{ operationResult.copiedAdSetId || '—' }}</div>
                </div>
                <div class="rounded-2xl border border-default bg-default px-4 py-3">
                  <div class="text-muted">Copied ad</div>
                  <div class="mt-1 font-medium text-toned break-all">{{ operationResult.copiedAdId || '—' }}</div>
                </div>
              </div>

              <div v-if="operationResult.blockers?.length" class="rounded-2xl border border-error/30 bg-error/10 p-4">
                <div class="text-sm font-semibold text-highlighted">Blockers</div>
                <ul class="mt-3 space-y-2 text-sm text-toned">
                  <li v-for="blocker in operationResult.blockers" :key="`${blocker.code}:${blocker.source}`">
                    <strong>{{ blocker.code }}</strong> — {{ blocker.message }}
                    <span class="text-muted">({{ blocker.source }})</span>
                  </li>
                </ul>
              </div>

              <div v-if="operationResult.warnings?.length" class="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                <div class="text-sm font-semibold text-highlighted">Warnings</div>
                <ul class="mt-3 space-y-2 text-sm text-toned">
                  <li v-for="warning in operationResult.warnings" :key="`${warning.code}:${warning.source}`">
                    <strong>{{ warning.code }}</strong> — {{ warning.message }}
                    <span class="text-muted">({{ warning.source }})</span>
                  </li>
                </ul>
              </div>

              <div class="rounded-2xl border border-default bg-default p-4">
                <div class="text-sm font-semibold text-highlighted">Raw response</div>
                <pre class="mt-3 max-h-96 overflow-auto rounded-2xl bg-elevated/20 p-4 text-xs leading-5 text-toned">{{ operationResultJson }}</pre>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>

    <AppEmptyState
      v-else
      title="Campaign belum tersedia"
      description="Belum ada hierarchy campaign yang bisa ditampilkan dari snapshot saat ini."
    />
  </div>
</template>
