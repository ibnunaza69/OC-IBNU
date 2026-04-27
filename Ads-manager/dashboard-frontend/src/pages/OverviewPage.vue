<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppIcon from '../components/AppIcon.vue'
import AppMetricCard from '../components/AppMetricCard.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import AppStatusBadge from '../components/AppStatusBadge.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardSummaryResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime, formatJson } from '../utils/format'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const error = ref('')
const summary = ref<DashboardSummaryResponse | null>(null)

const totals = computed(() => summary.value?.analysisOverview?.totals ?? null)
const budgets = computed(() => summary.value?.analysisOverview?.budgets ?? null)
const freshness = computed(() => summary.value?.analysisOverview?.freshness ?? null)

const topMetrics = computed(() => {
  const totalEntities = totals.value
    ? `${totals.value.campaigns ?? 0} / ${totals.value.adSets ?? 0} / ${totals.value.ads ?? 0}`
    : '—'
  const activeCampaignShare = totals.value && (totals.value.campaigns ?? 0) > 0
    ? `${totals.value.activeCampaigns ?? 0}/${totals.value.campaigns ?? 0}`
    : '—'
  const budgetTotal = budgets.value
    ? `${budgets.value.campaignDailyBudgetTotal ?? 0} ${budgets.value.currency ?? ''}`.trim()
    : '—'

  return [
    { label: 'Hierarchy', value: totalEntities, hint: 'Campaign / Ad Set / Ad', tone: 'neutral' },
    { label: 'Campaign aktif', value: activeCampaignShare, hint: 'Live coverage', tone: 'success' },
    { label: 'Budget total', value: budgetTotal, hint: 'Daily budget', tone: 'primary' },
    { label: 'Worker heartbeat', value: formatDateTime(summary.value?.foundation.workerHint), hint: 'Latest job', tone: 'warning' }
  ] as const
})

const healthCards = computed(() => {
  const recentJobs = summary.value?.recent.jobs ?? []
  const recentAssetTasks = summary.value?.recent.assetTasks ?? []
  const recentCredentials = summary.value?.recent.credentials ?? []
  const invalidCredentials = recentCredentials.filter((item) => !item.isValid).length
  const failedTasks = recentAssetTasks.filter((item) => ['failed', 'error'].includes(item.status.toLowerCase())).length
  const runningJobs = recentJobs.filter((item) => ['running', 'processing', 'submitted', 'queued'].includes(item.status.toLowerCase())).length

  return [
    {
      title: 'System health',
      description: 'Status pondasi dashboard dan provider utama.',
      items: [
        { label: 'Database', value: summary.value?.foundation.db ?? 'unknown' },
        { label: 'API', value: summary.value?.foundation.api ?? 'unknown' },
        { label: 'Meta provider', value: summary.value?.providers.meta.configured ? 'configured' : 'missing' },
        { label: 'KIE provider', value: summary.value?.providers.kie.configured ? 'configured' : 'missing' }
      ]
    },
    {
      title: 'Campaign status',
      description: 'Snapshot entitas aktif dan sinkronisasi.',
      items: [
        { label: 'Campaign aktif', value: String(totals.value?.activeCampaigns ?? 0) },
        { label: 'Ad set aktif', value: String(totals.value?.activeAdSets ?? 0) },
        { label: 'Ad aktif', value: String(totals.value?.activeAds ?? 0) },
        { label: 'Last sync', value: formatDateTime(freshness.value?.campaignsSyncedAt) }
      ]
    },
    {
      title: 'Operational activity',
      description: 'Job berjalan, task gagal, dan audit terbaru.',
      items: [
        { label: 'Job berjalan', value: String(runningJobs) },
        { label: 'Task gagal', value: String(failedTasks) },
        { label: 'Credential invalid', value: String(invalidCredentials) },
        { label: 'Last audit', value: formatDateTime(summary.value?.recent.audits[0]?.createdAt) }
      ]
    },
    {
      title: 'Performance signals',
      description: 'Metrik bisnis tampil setelah insights tersedia.',
      items: [
        { label: 'ROAS', value: 'Belum tersedia' },
        { label: 'Spend', value: 'Belum tersedia' },
        { label: 'CTR', value: 'Belum tersedia' },
        { label: 'Source', value: 'Menunggu insights' }
      ]
    }
  ]
})

const freshnessItems = computed(() => [
  { label: 'Account', value: formatDateTime(freshness.value?.accountSyncedAt) },
  { label: 'Campaigns', value: formatDateTime(freshness.value?.campaignsSyncedAt) },
  { label: 'Ad Sets', value: formatDateTime(freshness.value?.adSetsSyncedAt) },
  { label: 'Ads', value: formatDateTime(freshness.value?.adsSyncedAt) }
])

async function loadSummary() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getSummary()

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat overview dashboard.')
    }

    summary.value = payload
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat overview dashboard.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadSummary()
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="overview-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Control room"
          title="Status campaign dan sistem terkini"
          description="Ringkasan cepat status sistem, campaign aktif, dan freshness data."
        />

        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="soft" size="lg" :to="dashboardRoutes.campaigns">
            <template #leading>
              <AppIcon name="megaphone" class="size-4" />
            </template>
            Lihat campaigns
          </UButton>
          <UButton color="primary" variant="soft" size="lg" :to="dashboardRoutes.creatives">
            <template #leading>
              <AppIcon name="images" class="size-4" />
            </template>
            Buka creatives
          </UButton>
          <UButton color="neutral" variant="ghost" size="lg" @click="loadSummary" :loading="loading" loading-icon="">
            <template #leading>
              <AppIcon name="refresh-cw" class="size-4" />
            </template>
            Refresh
          </UButton>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Overview gagal dimuat" :description="error" />

    <div v-if="loading && !summary" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat control room...
    </div>

    <template v-else-if="summary">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppMetricCard
          v-for="metric in topMetrics"
          :key="metric.label"
          :label="metric.label"
          :value="metric.value"
          :hint="metric.hint"
          :tone="metric.tone"
        />
      </section>

      <section class="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        <article v-for="card in healthCards" :key="card.title" class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <div>
            <div class="text-sm font-semibold text-highlighted">{{ card.title }}</div>
            <p class="mt-1 text-sm leading-6 text-muted">{{ card.description }}</p>
          </div>

          <dl class="mt-5 grid gap-3 text-sm">
            <div v-for="item in card.items" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <dt class="text-muted">{{ item.label }}</dt>
              <dd class="text-right font-medium text-toned">{{ item.value }}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <AppSectionHeading eyebrow="Freshness" title="Timeline sinkronisasi" />

          <div class="mt-5 space-y-3">
            <div v-for="item in freshnessItems" :key="item.label" class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <div>
                <div class="text-sm font-medium text-highlighted">{{ item.label }}</div>
                <div class="text-sm text-muted">{{ item.value }}</div>
              </div>
              <UBadge color="primary" variant="soft">UTC</UBadge>
            </div>
          </div>

          <div class="mt-5 rounded-2xl border border-default bg-elevated/25 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-highlighted">Provider state</div>
                <div class="text-sm text-muted">Validasi credential operasional.</div>
              </div>
              <UBadge color="neutral" variant="soft">Live config</UBadge>
            </div>

            <div class="mt-4 grid gap-3">
              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium text-highlighted">Meta</div>
                    <div class="text-sm text-muted">{{ summary.providers.meta.credentialState?.subject || 'No subject' }}</div>
                  </div>
                  <AppStatusBadge :value="summary.providers.meta.credentialState?.isValid ?? summary.providers.meta.configured" :fallback="summary.providers.meta.configured ? 'configured' : 'missing'" />
                </div>
              </div>
              <div class="rounded-2xl border border-default bg-default px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium text-highlighted">KIE</div>
                    <div class="text-sm text-muted">{{ summary.providers.kie.credentialState?.subject || 'No subject' }}</div>
                  </div>
                  <AppStatusBadge :value="summary.providers.kie.credentialState?.isValid ?? summary.providers.kie.configured" :fallback="summary.providers.kie.configured ? 'configured' : 'missing'" />
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <AppSectionHeading eyebrow="Recent activity" title="Jobs, audits, dan tasks" />
          <div class="mt-5 grid gap-4 xl:grid-cols-3">
            <div class="space-y-3">
              <div class="text-sm font-semibold text-highlighted">Jobs</div>
              <div v-for="item in summary.recent.jobs.slice(0, 4)" :key="`${item.jobName}-${item.updatedAt}`" class="rounded-2xl border border-default bg-elevated/25 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-highlighted break-words">{{ item.jobName }}</div>
                    <div class="text-sm text-muted break-all">{{ item.jobKey || 'no key' }}</div>
                  </div>
                  <AppStatusBadge class="shrink-0" :value="item.status" />
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-sm font-semibold text-highlighted">Audits</div>
              <div v-for="item in summary.recent.audits.slice(0, 4)" :key="`${item.operationType}-${item.targetId}-${item.createdAt}`" class="rounded-2xl border border-default bg-elevated/25 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-highlighted break-words">{{ item.operationType }}</div>
                    <div class="text-sm text-muted break-all">{{ item.targetType }}:{{ item.targetId }}</div>
                  </div>
                  <AppStatusBadge class="shrink-0" :value="item.status" />
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="text-sm font-semibold text-highlighted">Asset tasks</div>
              <div v-for="item in summary.recent.assetTasks.slice(0, 4)" :key="`${item.provider}-${item.taskType}-${item.updatedAt}`" class="rounded-2xl border border-default bg-elevated/25 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-highlighted break-words">{{ item.assetType }}</div>
                    <div class="text-sm text-muted break-all">{{ item.provider }} · {{ item.taskType }}</div>
                  </div>
                  <AppStatusBadge class="shrink-0" :value="item.status" />
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <details class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <summary class="cursor-pointer text-sm font-semibold text-highlighted">Raw observability</summary>
        <pre class="mt-4 overflow-auto rounded-2xl bg-elevated/25 p-4 text-xs leading-6 text-toned">{{ formatJson(summary.analysisOverview) }}</pre>
      </details>
    </template>

    <AppEmptyState
      v-else
      title="Overview belum tersedia"
      description="Belum ada data yang bisa ditampilkan dari summary dashboard saat ini."
    />
  </div>
</template>
