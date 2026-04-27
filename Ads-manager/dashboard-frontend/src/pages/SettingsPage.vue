<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import AppStatusBadge from '../components/AppStatusBadge.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardMetaConnection, DashboardSettingsResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime } from '../utils/format'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const saving = ref(false)
const oauthStarting = ref(false)
const error = ref('')
const success = ref('')
const settings = ref<DashboardSettingsResponse | null>(null)
const connectionSaving = ref<Record<string, boolean>>({})

const form = reactive({
  dashboardUsername: '',
  dashboardAuthEnabled: true,
  dashboardCookieSecure: true,
  dashboardSessionTtlSeconds: 43200,
  dashboardLoginMaxAttempts: 5,
  dashboardLoginBlockMinutes: 15,
  metaAccessToken: '',
  metaAdAccountId: '',
  metaWriteEnabled: false,
  metaWriteApprovalRequired: true,
  metaAppId: '',
  metaAppSecret: '',
  metaOAuthRedirectUri: '',
  metaGraphApiVersion: 'v25.0',
  kieApiKey: '',
  kieCallbackUrl: '',
  reason: 'Dashboard settings updated from dashboard UI'
})

const connectionForms = reactive<Record<string, {
  adAccountIds: string[]
  pageIds: string[]
  pixelIds: string[]
  businessIds: string[]
  primaryAdAccountId: string
  bindRuntime: boolean
}>>({})

const dashboardCards = computed(() => {
  if (!settings.value) {
    return []
  }

  return [
    { label: 'Auth enabled', value: settings.value.dashboard.authEnabled ? 'Yes' : 'No' },
    { label: 'Username', value: settings.value.dashboard.username || '—' },
    { label: 'Secure cookie', value: settings.value.dashboard.secureCookie ? 'Yes' : 'No' },
    { label: 'Session TTL', value: `${settings.value.dashboard.sessionTtlSeconds}s` },
    { label: 'Password hash', value: settings.value.dashboard.passwordConfigured ? 'Configured' : 'Missing' },
    { label: 'Meta connections', value: String(settings.value.providers.meta.connections.length) }
  ]
})

const onboardingSteps = computed(() => {
  const meta = settings.value?.providers.meta
  const connectedCount = meta?.connections.length ?? 0
  const hasMetaConfig = Boolean(form.metaAppId && form.metaOAuthRedirectUri && meta?.appSecretConfigured)
  const selectedAssets = meta?.connections.reduce((sum, connection) => {
    return sum
      + connection.selection.adAccountIds.length
      + connection.selection.pageIds.length
      + connection.selection.pixelIds.length
      + connection.selection.businessIds.length
  }, 0) ?? 0
  const hasRuntimeBound = Boolean(meta?.connections.some((connection) => connection.runtimeBound))

  return [
    {
      step: 'Step 1',
      title: 'Siapkan app config',
      done: hasMetaConfig,
      detail: hasMetaConfig ? 'App ID, redirect URI, dan app secret siap.' : 'Isi App ID, App Secret, dan Redirect URI.'
    },
    {
      step: 'Step 2',
      title: 'Connect Meta',
      done: connectedCount > 0,
      detail: connectedCount > 0 ? `${connectedCount} connection tersimpan.` : 'Belum ada connection Meta yang authorize.'
    },
    {
      step: 'Step 3',
      title: 'Pilih asset',
      done: selectedAssets > 0,
      detail: selectedAssets > 0 ? `${selectedAssets} asset sudah dipilih.` : 'Pilih asset yang relevan untuk workflow.'
    },
    {
      step: 'Step 4',
      title: 'Tentukan runtime binding',
      done: hasRuntimeBound,
      detail: hasRuntimeBound ? 'Sudah ada connection runtime aktif.' : 'Belum ada connection runtime aktif.'
    }
  ]
})

const reviewReadinessCards = computed(() => {
  const summary = settings.value?.reviewReadiness.summary
  if (!summary) {
    return []
  }

  return [
    { label: 'Ready items', value: `${summary.readyItems}/${summary.totalItems}` },
    { label: 'Blockers', value: String(summary.blockerCount) },
    { label: 'Warnings', value: String(summary.warningCount) }
  ]
})

function getConnectionHealth(connection: DashboardMetaConnection) {
  const colorMap: Record<DashboardMetaConnection['health']['level'], string> = {
    success: 'success',
    info: 'primary',
    warning: 'warning',
    error: 'error'
  }

  return {
    label: connection.health.label,
    color: colorMap[connection.health.level],
    note: connection.health.issues[0] || (connection.runtimeBound ? 'Connection runtime aktif.' : 'Connection tersimpan.')
  }
}

function getConnectionSelectionSummary(connection: DashboardMetaConnection) {
  return [
    `${connection.selection.adAccountIds.length} ad account terpilih`,
    `${connection.selection.pageIds.length} page terpilih`,
    `${connection.selection.pixelIds.length} pixel terpilih`,
    `${connection.selection.businessIds.length} business terpilih`
  ].join(' · ')
}

function syncConnectionForms(connections: DashboardMetaConnection[]) {
  for (const key of Object.keys(connectionForms)) {
    delete connectionForms[key]
  }

  for (const connection of connections) {
    connectionForms[connection.id] = {
      adAccountIds: [...connection.selection.adAccountIds],
      pageIds: [...connection.selection.pageIds],
      pixelIds: [...connection.selection.pixelIds],
      businessIds: [...connection.selection.businessIds],
      primaryAdAccountId: connection.selection.primaryAdAccountId || connection.selection.adAccountIds[0] || '',
      bindRuntime: connection.runtimeBound
    }
  }
}

function syncForm(payload: DashboardSettingsResponse) {
  form.dashboardUsername = payload.dashboard.username || ''
  form.dashboardAuthEnabled = payload.dashboard.authEnabled
  form.dashboardCookieSecure = payload.dashboard.secureCookie
  form.dashboardSessionTtlSeconds = payload.dashboard.sessionTtlSeconds
  form.dashboardLoginMaxAttempts = payload.dashboard.loginMaxAttempts
  form.dashboardLoginBlockMinutes = payload.dashboard.loginBlockMinutes
  form.metaAccessToken = ''
  form.metaAdAccountId = payload.providers.meta.adAccountId || ''
  form.metaWriteEnabled = payload.providers.meta.writeEnabled
  form.metaWriteApprovalRequired = payload.providers.meta.writeApprovalRequired
  form.metaAppId = payload.providers.meta.appId || ''
  form.metaAppSecret = ''
  form.metaOAuthRedirectUri = payload.providers.meta.oauthRedirectUri || ''
  form.metaGraphApiVersion = payload.providers.meta.graphApiVersion || 'v25.0'
  form.kieApiKey = ''
  form.kieCallbackUrl = payload.providers.kie.callbackUrl || ''
  form.reason = 'Dashboard settings updated from dashboard UI'
  syncConnectionForms(payload.providers.meta.connections)
}

async function loadSettings() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getSettings()

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat settings dashboard.')
    }

    settings.value = payload
    syncForm(payload)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat settings dashboard.'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.updateSettings({
      dashboardUsername: form.dashboardUsername || null,
      dashboardAuthEnabled: form.dashboardAuthEnabled,
      dashboardCookieSecure: form.dashboardCookieSecure,
      dashboardSessionTtlSeconds: form.dashboardSessionTtlSeconds,
      dashboardLoginMaxAttempts: form.dashboardLoginMaxAttempts,
      dashboardLoginBlockMinutes: form.dashboardLoginBlockMinutes,
      ...(form.metaAccessToken ? { metaAccessToken: form.metaAccessToken } : {}),
      metaAdAccountId: form.metaAdAccountId || null,
      metaWriteEnabled: form.metaWriteEnabled,
      metaWriteApprovalRequired: form.metaWriteApprovalRequired,
      metaAppId: form.metaAppId || null,
      ...(form.metaAppSecret ? { metaAppSecret: form.metaAppSecret } : {}),
      metaOAuthRedirectUri: form.metaOAuthRedirectUri || null,
      metaGraphApiVersion: form.metaGraphApiVersion || null,
      ...(form.kieApiKey ? { kieApiKey: form.kieApiKey } : {}),
      kieCallbackUrl: form.kieCallbackUrl || null,
      reason: form.reason
    })

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal menyimpan settings dashboard.')
    }

    settings.value = payload
    syncForm(payload)
    success.value = 'Settings tersimpan. Restart service disarankan setelah perubahan env.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menyimpan settings dashboard.'
  } finally {
    saving.value = false
  }
}

async function startMetaOAuth() {
  oauthStarting.value = true
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.startMetaOAuth()

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal membuat URL connect Meta.')
    }

    const popup = window.open(payload.authUrl, 'meta-oauth-connect', 'width=720,height=840')
    if (!popup) {
      window.location.href = payload.authUrl
      return
    }

    success.value = 'Popup Meta OAuth dibuka. Setelah authorize, dashboard akan refresh otomatis.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memulai Meta OAuth.'
  } finally {
    oauthStarting.value = false
  }
}

function toggleSelection(list: string[], itemId: string, checked: boolean) {
  const next = new Set(list)
  if (checked) {
    next.add(itemId)
  } else {
    next.delete(itemId)
  }

  return Array.from(next)
}

function updateConnectionArray(connectionId: string, key: 'adAccountIds' | 'pageIds' | 'pixelIds' | 'businessIds', itemId: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target || !connectionForms[connectionId]) {
    return
  }

  connectionForms[connectionId][key] = toggleSelection(connectionForms[connectionId][key], itemId, target.checked)

  if (key === 'adAccountIds' && !connectionForms[connectionId].adAccountIds.includes(connectionForms[connectionId].primaryAdAccountId)) {
    connectionForms[connectionId].primaryAdAccountId = connectionForms[connectionId].adAccountIds[0] || ''
  }
}

async function saveConnection(connection: DashboardMetaConnection) {
  const selection = connectionForms[connection.id]
  if (!selection) {
    return
  }

  connectionSaving.value[connection.id] = true
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.saveMetaSelections(connection.id, {
      adAccountIds: selection.adAccountIds,
      pageIds: selection.pageIds,
      pixelIds: selection.pixelIds,
      businessIds: selection.businessIds,
      primaryAdAccountId: selection.primaryAdAccountId || null,
      bindRuntime: selection.bindRuntime
    })

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok || !payload.connection) {
      throw new Error('Gagal menyimpan pilihan asset Meta.')
    }

    success.value = payload.connection.runtimeBound
      ? `Pilihan asset ${payload.connection.profileName} tersimpan. Restart service agar binding runtime aktif.`
      : `Pilihan asset ${payload.connection.profileName} tersimpan.`
    await loadSettings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menyimpan pilihan asset Meta.'
  } finally {
    connectionSaving.value[connection.id] = false
  }
}

async function unbindConnection(connection: DashboardMetaConnection) {
  connectionSaving.value[connection.id] = true
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.unbindMetaConnection(connection.id)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok || !payload.connection) {
      throw new Error('Gagal unbind connection Meta.')
    }

    success.value = payload.note || `Connection ${payload.connection.profileName} berhasil di-unbind dari penetapan operasional berikutnya.`
    await loadSettings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal unbind connection Meta.'
  } finally {
    connectionSaving.value[connection.id] = false
  }
}

async function removeConnection(connection: DashboardMetaConnection) {
  if (!window.confirm(`Hapus connection ${connection.profileName}? Unbind dulu jika masih runtime-bound.`)) {
    return
  }

  connectionSaving.value[connection.id] = true
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.removeMetaConnection(connection.id)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal menghapus connection Meta.')
    }

    success.value = `Connection ${connection.profileName} berhasil dihapus dari daftar tersimpan.`
    await loadSettings()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menghapus connection Meta.'
  } finally {
    connectionSaving.value[connection.id] = false
  }
}

function handleOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) {
    return
  }

  if (event.data?.type === 'meta-oauth-complete') {
    success.value = 'Meta OAuth selesai. Connection dimuat ulang.'
    void loadSettings()
  }
}

onMounted(() => {
  window.addEventListener('message', handleOAuthMessage)
  void loadSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleOAuthMessage)
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="settings-page">
    <div class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <AppSectionHeading
          eyebrow="Settings & credentials"
          title="Runtime, OAuth, dan asset binding"
          description="Kelola koneksi, credential, dan binding runtime."
        />

        <div class="flex flex-wrap gap-2">
          <UBadge color="primary" variant="soft">Meta graph {{ form.metaGraphApiVersion || 'v25.0' }}</UBadge>
          <UBadge color="neutral" variant="soft">{{ settings?.providers.meta.connections.length || 0 }} connection</UBadge>
          <UBadge color="warning" variant="soft">Restart disarankan setelah ubah env</UBadge>
        </div>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      title="Settings action gagal"
      :description="error"
    />

    <UAlert
      v-if="success"
      color="success"
      variant="soft"
      title="Settings action berhasil"
      :description="success"
    />

    <section class="rounded-2xl border border-default bg-default p-5 shadow-xs">
      <AppSectionHeading
        eyebrow="Compliance readiness"
        title="Compliance checklist"
        description="Checklist setup dan validasi sebelum dipakai operasional."
      />

      <div class="mt-5 grid gap-4 xl:grid-cols-4">
        <article v-for="item in onboardingSteps" :key="item.step" class="rounded-2xl border border-default bg-elevated/20 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-muted">{{ item.step }}</div>
              <div class="mt-1 text-base font-semibold text-highlighted">{{ item.title }}</div>
            </div>
            <UBadge :color="item.done ? 'success' : 'neutral'" variant="soft">{{ item.done ? 'Ready' : 'Pending' }}</UBadge>
          </div>
          <p class="mt-3 text-sm text-muted">{{ item.detail }}</p>
        </article>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <div v-for="item in reviewReadinessCards" :key="item.label" class="rounded-2xl border border-default bg-elevated/20 px-4 py-3">
          <div class="text-xs uppercase tracking-wide text-muted">{{ item.label }}</div>
          <div class="mt-1 text-lg font-semibold text-highlighted">{{ item.value }}</div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs xl:col-span-1">
        <AppSectionHeading eyebrow="Snapshot" title="Ringkasan runtime sekarang" />

        <dl class="mt-5 grid gap-3 text-sm">
          <div v-for="item in dashboardCards" :key="item.label" class="flex items-start justify-between gap-3 rounded-2xl border border-default bg-elevated/20 px-4 py-3">
            <dt class="text-muted">{{ item.label }}</dt>
            <dd class="text-right font-medium text-toned">{{ item.value }}</dd>
          </div>
        </dl>

      </article>

      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs xl:col-span-2">
        <AppSectionHeading eyebrow="Connection setup" title="Setup koneksi Meta dan binding operasional" />

        <details class="mt-5 rounded-2xl border border-default bg-elevated/20 p-4">
          <summary class="cursor-pointer list-none text-sm font-semibold text-highlighted">Advanced settings</summary>

          <div class="mt-4 grid gap-4 xl:grid-cols-2">
          <section class="space-y-4 rounded-2xl border border-default bg-elevated/20 p-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Dashboard username</label>
              <UInput v-model="form.dashboardUsername" size="lg" class="w-full" placeholder="admin" />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-default px-4 py-3">
                <span class="text-sm text-toned">Dashboard auth</span>
                <UToggle v-model="form.dashboardAuthEnabled" />
              </label>
              <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-default px-4 py-3">
                <span class="text-sm text-toned">Secure cookie</span>
                <UToggle v-model="form.dashboardCookieSecure" />
              </label>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Session TTL</label>
                <UInput v-model.number="form.dashboardSessionTtlSeconds" type="number" size="lg" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Max login attempts</label>
                <UInput v-model.number="form.dashboardLoginMaxAttempts" type="number" size="lg" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Block minutes</label>
                <UInput v-model.number="form.dashboardLoginBlockMinutes" type="number" size="lg" />
              </div>
            </div>
          </section>

          <section class="space-y-4 rounded-2xl border border-default bg-elevated/20 p-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Meta access token override</label>
              <UInput v-model="form.metaAccessToken" size="lg" type="password" class="w-full" placeholder="Kosongkan bila tidak mau ganti token runtime saat ini" />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Primary runtime ad account</label>
                <UInput v-model="form.metaAdAccountId" size="lg" class="w-full" placeholder="1234567890" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">KIE callback URL</label>
                <UInput v-model="form.kieCallbackUrl" size="lg" class="w-full" placeholder="https://domain/callback" />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-default px-4 py-3">
                <span class="text-sm text-toned">Meta write enabled</span>
                <UToggle v-model="form.metaWriteEnabled" />
              </label>
              <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-default px-4 py-3">
                <span class="text-sm text-toned">Meta write approval required</span>
                <UToggle v-model="form.metaWriteApprovalRequired" />
              </label>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">KIE API key override</label>
              <UInput v-model="form.kieApiKey" size="lg" type="password" class="w-full" placeholder="Kosongkan bila tidak mau ganti API key" />
            </div>
          </section>
          </div>
        </details>

        <section class="mt-5 space-y-4 rounded-2xl border border-default bg-elevated/20 p-4">
          <AppSectionHeading eyebrow="Meta OAuth" title="Generate token dan connect multi-account" />

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Meta app ID</label>
              <UInput v-model="form.metaAppId" size="lg" class="w-full" placeholder="123456789" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Meta app secret</label>
              <UInput v-model="form.metaAppSecret" size="lg" type="password" class="w-full" placeholder="Kosongkan bila tidak ganti secret" />
            </div>
            <div class="space-y-2 xl:col-span-2">
              <label class="text-sm font-medium text-toned">Meta OAuth redirect URI</label>
              <UInput v-model="form.metaOAuthRedirectUri" size="lg" class="w-full" placeholder="https://domain-anda/dashboard/meta/callback" />
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-[220px_1fr]">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Graph API version</label>
              <UInput v-model="form.metaGraphApiVersion" size="lg" class="w-full" placeholder="v25.0" />
            </div>
            <div class="rounded-2xl border border-default bg-default p-4 text-sm text-muted">
              Setelah App ID, App Secret, dan Redirect URI tersimpan, klik <strong>Connect Meta</strong> untuk mulai OAuth.
            </div>
          </div>


          <div class="flex flex-wrap gap-2">
            <UButton color="primary" variant="soft" size="lg" :loading="saving" loading-icon="" @click="saveSettings">
              Simpan settings
            </UButton>
            <UButton color="warning" variant="soft" size="lg" :loading="oauthStarting" loading-icon="" @click="startMetaOAuth">
              Connect Meta / Generate token
            </UButton>
            <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadSettings">
              Refresh data
            </UButton>
          </div>
        </section>
      </article>
    </section>

    <section class="space-y-4 rounded-2xl border border-default bg-default p-5 shadow-xs">
      <AppSectionHeading eyebrow="Meta connections" title="Ads account, page, business, dan pixel" description="Pilih asset dan tentukan primary account runtime." />

      <div v-if="loading && !settings" class="rounded-2xl border border-default bg-elevated/20 p-8 text-sm text-muted">
        Memuat settings dan connection Meta...
      </div>

      <template v-else-if="settings?.providers.meta.connections.length">
        <article
          v-for="connection in settings.providers.meta.connections"
          :key="connection.id"
          class="space-y-4 rounded-2xl border border-default bg-elevated/20 p-4"
        >
          <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div class="min-w-0">
              <div class="text-base font-semibold text-highlighted break-words">{{ connection.profileName }}</div>
              <div class="text-sm text-muted break-all">{{ connection.label }} · {{ connection.tokenPreview }} · {{ connection.graphApiVersion }}</div>
              <div class="mt-2 text-sm text-muted">{{ getConnectionHealth(connection).note }}</div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge :color="getConnectionHealth(connection).color" variant="soft">{{ getConnectionHealth(connection).label }}</UBadge>
              <UBadge color="primary" variant="soft">{{ connection.adAccounts.length }} ad accounts</UBadge>
              <UBadge color="neutral" variant="soft">{{ connection.pages.length }} pages</UBadge>
              <UBadge color="warning" variant="soft">{{ connection.pixels.length }} pixels</UBadge>
              <UBadge color="neutral" variant="soft">{{ connection.businesses.length }} businesses</UBadge>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6 text-sm">
            <div class="rounded-2xl border border-default bg-default px-4 py-3">
              <div class="text-muted">Token expires</div>
              <div class="mt-1 font-medium text-toned">{{ formatDateTime(connection.tokenExpiresAt) }}</div>
            </div>
            <div class="rounded-2xl border border-default bg-default px-4 py-3 md:col-span-2">
              <div class="text-muted">Scopes</div>
              <div class="mt-1 font-medium text-toned break-all">{{ connection.scopes.join(', ') || '—' }}</div>
            </div>
            <div class="rounded-2xl border border-default bg-default px-4 py-3">
              <div class="text-muted">Runtime bound</div>
              <div class="mt-1"><AppStatusBadge :value="connection.runtimeBound ? 'BOUND' : 'STORED'" /></div>
            </div>
            <div class="rounded-2xl border border-default bg-default px-4 py-3">
              <div class="text-muted">Created</div>
              <div class="mt-1 font-medium text-toned">{{ formatDateTime(connection.createdAt) }}</div>
            </div>
            <div class="rounded-2xl border border-default bg-default px-4 py-3">
              <div class="text-muted">Updated</div>
              <div class="mt-1 font-medium text-toned">{{ formatDateTime(connection.updatedAt) }}</div>
            </div>
          </div>

          <div class="rounded-2xl border border-default bg-default p-4 text-sm text-muted">
            <div class="font-medium text-toned">Ringkasan asset terpilih</div>
            <div class="mt-2">{{ getConnectionSelectionSummary(connection) }}</div>
            <ul v-if="connection.health.issues.length" class="mt-3 space-y-2">
              <li v-for="item in connection.health.issues" :key="item">• {{ item }}</li>
            </ul>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <section class="space-y-3 rounded-2xl border border-default bg-default p-4">
              <div class="text-sm font-semibold text-highlighted">Ads accounts</div>
              <div v-if="connection.adAccounts.length" class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <label v-for="item in connection.adAccounts" :key="item.id" class="flex items-start gap-3 rounded-2xl border border-default px-4 py-3">
                  <input
                    :checked="connectionForms[connection.id]?.adAccountIds.includes(item.id)"
                    type="checkbox"
                    class="mt-1"
                    @change="updateConnectionArray(connection.id, 'adAccountIds', item.id, $event)"
                  >
                  <span class="min-w-0 flex-1 text-sm">
                    <span class="block font-medium text-toned break-words">{{ item.name }}</span>
                    <span class="block text-muted break-all">{{ item.accountId || item.id }} · {{ item.currency || '—' }} · status {{ item.status || '—' }}</span>
                  </span>
                </label>
              </div>
              <AppEmptyState v-else title="Belum ada ads account" description="Token ini belum mengembalikan ads account yang bisa dibaca." />
            </section>

            <section class="space-y-3 rounded-2xl border border-default bg-default p-4">
              <div class="text-sm font-semibold text-highlighted">Pages</div>
              <div v-if="connection.pages.length" class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <label v-for="item in connection.pages" :key="item.id" class="flex items-start gap-3 rounded-2xl border border-default px-4 py-3">
                  <input
                    :checked="connectionForms[connection.id]?.pageIds.includes(item.id)"
                    type="checkbox"
                    class="mt-1"
                    @change="updateConnectionArray(connection.id, 'pageIds', item.id, $event)"
                  >
                  <span class="min-w-0 flex-1 text-sm">
                    <span class="block font-medium text-toned break-words">{{ item.name }}</span>
                    <span class="block text-muted break-all">{{ item.id }} · {{ item.category || '—' }} · tasks {{ item.tasks?.join(', ') || '—' }}</span>
                  </span>
                </label>
              </div>
              <AppEmptyState v-else title="Belum ada page" description="Token ini belum mengembalikan page yang bisa dibaca." />
            </section>

            <section class="space-y-3 rounded-2xl border border-default bg-default p-4">
              <div class="text-sm font-semibold text-highlighted">Pixels</div>
              <div v-if="connection.pixels.length" class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <label v-for="item in connection.pixels" :key="item.id" class="flex items-start gap-3 rounded-2xl border border-default px-4 py-3">
                  <input
                    :checked="connectionForms[connection.id]?.pixelIds.includes(item.id)"
                    type="checkbox"
                    class="mt-1"
                    @change="updateConnectionArray(connection.id, 'pixelIds', item.id, $event)"
                  >
                  <span class="min-w-0 flex-1 text-sm">
                    <span class="block font-medium text-toned break-words">{{ item.name }}</span>
                    <span class="block text-muted break-all">{{ item.id }} · account {{ item.accountId || '—' }} · {{ item.code || 'no code' }}</span>
                  </span>
                </label>
              </div>
              <AppEmptyState v-else title="Belum ada pixel" description="Pixel akan ikut kebaca dari ads account yang bisa diakses token ini." />
            </section>

            <section class="space-y-3 rounded-2xl border border-default bg-default p-4">
              <div class="text-sm font-semibold text-highlighted">Businesses</div>
              <div v-if="connection.businesses.length" class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <label v-for="item in connection.businesses" :key="item.id" class="flex items-start gap-3 rounded-2xl border border-default px-4 py-3">
                  <input
                    :checked="connectionForms[connection.id]?.businessIds.includes(item.id)"
                    type="checkbox"
                    class="mt-1"
                    @change="updateConnectionArray(connection.id, 'businessIds', item.id, $event)"
                  >
                  <span class="min-w-0 flex-1 text-sm">
                    <span class="block font-medium text-toned break-words">{{ item.name }}</span>
                    <span class="block text-muted break-all">{{ item.id }} · verification {{ item.status || '—' }}</span>
                  </span>
                </label>
              </div>
              <AppEmptyState v-else title="Belum ada business" description="Token ini belum mengembalikan business asset yang bisa dibaca." />
            </section>
          </div>

          <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div class="rounded-2xl border border-default bg-default p-4">
              <label class="text-sm font-medium text-toned">Primary ad account untuk runtime backend</label>
              <select v-model="connectionForms[connection.id].primaryAdAccountId" class="mt-2 w-full rounded-2xl border border-default bg-default px-4 py-3 text-sm text-toned outline-none">
                <option value="">Pilih primary ad account</option>
                <option
                  v-for="item in connection.adAccounts.filter((asset) => connectionForms[connection.id]?.adAccountIds.includes(asset.id))"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }} · {{ item.accountId || item.id }}
                </option>
              </select>
            </div>

            <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-default px-4 py-3">
              <span class="text-sm text-toned">Tulis token ini ke env runtime</span>
              <UToggle v-model="connectionForms[connection.id].bindRuntime" />
            </label>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="lg"
              :loading="connectionSaving[connection.id]"
              loading-icon=""
              @click="saveConnection(connection)"
            >
              Simpan pilihan asset
            </UButton>
            <UButton
              color="warning"
              variant="soft"
              size="lg"
              :disabled="!connection.runtimeBound || connectionSaving[connection.id]"
              :loading="connectionSaving[connection.id]"
              loading-icon=""
              @click="unbindConnection(connection)"
            >
              Unbind connection
            </UButton>
            <UButton
              color="error"
              variant="soft"
              size="lg"
              :disabled="connection.runtimeBound || connectionSaving[connection.id]"
              :loading="connectionSaving[connection.id]"
              loading-icon=""
              @click="removeConnection(connection)"
            >
              Hapus connection
            </UButton>
          </div>
        </article>
      </template>

      <AppEmptyState
        v-else
        title="Belum ada Meta connection"
        description="Isi App ID, App Secret, Redirect URI, lalu klik Connect Meta."
      />
    </section>

    <section class="space-y-4 rounded-2xl border border-default bg-default p-5 shadow-xs">
      <AppSectionHeading eyebrow="Credential states" title="Status credential backend yang terdeteksi" />

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="item in settings?.credentials || []" :key="`${item.provider}-${item.subject}`" class="rounded-2xl border border-default bg-elevated/20 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-highlighted break-words">{{ item.provider }}</div>
              <div class="mt-1 text-sm text-muted break-all">{{ item.subject || 'default' }}</div>
            </div>
            <AppStatusBadge class="shrink-0" :value="item.status" />
          </div>

          <div class="mt-3 text-sm text-muted">
            <div>Updated: {{ formatDateTime(item.updatedAt) }}</div>
            <div v-if="item.errorCode || item.errorMessage" class="mt-2 text-error">
              {{ item.errorCode || 'ERROR' }} · {{ item.errorMessage || 'Unknown provider error' }}
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
