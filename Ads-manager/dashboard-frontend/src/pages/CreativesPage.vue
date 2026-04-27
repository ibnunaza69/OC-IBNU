<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppEmptyState from '../components/AppEmptyState.vue'
import AppSectionHeading from '../components/AppSectionHeading.vue'
import AppStatusBadge from '../components/AppStatusBadge.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import type { DashboardCreativeLibraryResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'
import { formatDateTime } from '../utils/format'

const router = useRouter()
const api = useDashboardApi()

const loading = ref(false)
const submitting = ref(false)
const deletingId = ref<string | null>(null)
const error = ref('')
const success = ref('')
const search = ref('')
const assetType = ref<'all' | 'image' | 'video'>('all')
const library = ref<DashboardCreativeLibraryResponse | null>(null)

const assetTypeOptions = [
  { label: 'Semua asset', value: 'all' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' }
]

const generationTypeOptions = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' }
]

const videoAspectRatioOptions = [
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16', value: '9:16' }
]

const generateForm = reactive({
  assetType: 'image' as 'image' | 'video',
  reason: 'Generate creative from dashboard',
  imageProviderPayload: JSON.stringify({
    prompt: 'Create a clean promotional image for Meta Ads campaign',
    aspectRatio: '1:1'
  }, null, 2),
  imageTemplateVersion: '',
  imageCallbackUrl: '',
  imageDryRun: false,
  videoPrompt: 'Create a short promotional video for the campaign',
  videoImageAssetId: '',
  videoImageUrl: '',
  videoDurationSeconds: 5 as 5 | 10,
  videoQuality: '720p' as '720p' | '1080p',
  videoAspectRatio: '9:16' as '16:9' | '4:3' | '1:1' | '3:4' | '9:16',
  videoTemplateVersion: '',
  videoCallbackUrl: '',
  videoDryRun: false
})

const filteredItems = computed(() => {
  const items = library.value?.items ?? []
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return items
  }

  return items.filter((item) =>
    [item.id, item.title, item.provider, item.providerAssetId, item.mimeType, item.promptVersion]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query))
  )
})

async function loadLibrary() {
  loading.value = true
  error.value = ''

  try {
    const { response, payload } = await api.getCreativeLibrary({ limit: 60, assetType: assetType.value })

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat creative library.')
    }

    library.value = payload
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat creative library.'
  } finally {
    loading.value = false
  }
}

async function submitGenerate() {
  submitting.value = true
  error.value = ''
  success.value = ''

  try {
    let body

    if (generateForm.assetType === 'image') {
      body = {
        assetType: 'image' as const,
        reason: generateForm.reason,
        image: {
          providerPayload: JSON.parse(generateForm.imageProviderPayload),
          ...(generateForm.imageTemplateVersion ? { templateVersion: generateForm.imageTemplateVersion } : {}),
          ...(generateForm.imageCallbackUrl ? { callbackUrl: generateForm.imageCallbackUrl } : {}),
          enqueuePolling: true,
          dryRun: generateForm.imageDryRun
        }
      }
    } else {
      body = {
        assetType: 'video' as const,
        reason: generateForm.reason,
        video: {
          prompt: generateForm.videoPrompt,
          ...(generateForm.videoImageAssetId ? { imageAssetId: generateForm.videoImageAssetId } : {}),
          ...(generateForm.videoImageUrl ? { imageUrl: generateForm.videoImageUrl } : {}),
          durationSeconds: generateForm.videoDurationSeconds,
          quality: generateForm.videoQuality,
          aspectRatio: generateForm.videoAspectRatio,
          ...(generateForm.videoTemplateVersion ? { templateVersion: generateForm.videoTemplateVersion } : {}),
          ...(generateForm.videoCallbackUrl ? { callbackUrl: generateForm.videoCallbackUrl } : {}),
          enqueuePolling: true,
          dryRun: generateForm.videoDryRun
        }
      }
    }

    const { response, payload } = await api.generateCreative(body)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal membuat task creative dari dashboard.')
    }

    success.value = payload.result.mode === 'dry-run'
      ? 'Generate dry-run berhasil dibuat. Cek payload dan sesuaikan jika ingin live submit.'
      : 'Task generate berhasil dibuat dari dashboard.'

    await loadLibrary()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal membuat task creative dari dashboard.'
  } finally {
    submitting.value = false
  }
}

async function deleteAsset(assetId: string) {
  const confirmed = window.confirm('Hapus asset ini dari creative library? Tindakan ini hanya menghapus record library lokal.')
  if (!confirmed) {
    return
  }

  deletingId.value = assetId
  error.value = ''
  success.value = ''

  try {
    const { response, payload } = await api.deleteCreative(assetId)

    if (response.status === 401) {
      await router.replace(dashboardRoutes.login)
      return
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Gagal menghapus creative asset.')
    }

    success.value = 'Asset berhasil dihapus dari creative library.'
    await loadLibrary()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal menghapus creative asset.'
  } finally {
    deletingId.value = null
  }
}

watch(assetType, () => {
  void loadLibrary()
})

onMounted(() => {
  void loadLibrary()
})
</script>

<template>
  <div class="space-y-8 p-5 sm:p-8" data-testid="creatives-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Creative library"
          title="Creative assets"
          description="Generate, review, dan cleanup asset dari satu halaman."
        />
        <div class="flex flex-wrap gap-2">
          <UBadge color="primary" variant="soft">{{ library?.totals.total ?? 0 }} total</UBadge>
          <UBadge color="neutral" variant="soft">{{ library?.totals.image ?? 0 }} image</UBadge>
          <UBadge color="warning" variant="soft">{{ library?.totals.video ?? 0 }} video</UBadge>
        </div>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Creative action gagal" :description="error" />
    <UAlert v-if="success" color="success" variant="soft" title="Creative action berhasil" :description="success" />

    <section class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <AppSectionHeading eyebrow="Generate" title="Buat task creative baru" />
        <div class="mt-5 grid gap-4">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Asset type</label>
              <USelect v-model="generateForm.assetType" class="w-full" size="lg" :items="generationTypeOptions" value-key="value" label-key="label" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Reason</label>
              <UInput v-model="generateForm.reason" class="w-full" size="lg" placeholder="Reason for generation" />
            </div>
          </div>

          <template v-if="generateForm.assetType === 'image'">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Provider payload (JSON)</label>
              <textarea v-model="generateForm.imageProviderPayload" class="min-h-[220px] w-full rounded-2xl border border-default bg-elevated/20 px-4 py-3 text-sm text-toned outline-none" spellcheck="false" />
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Template version</label>
                <UInput v-model="generateForm.imageTemplateVersion" class="w-full" size="lg" placeholder="optional" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Callback URL</label>
                <UInput v-model="generateForm.imageCallbackUrl" class="w-full" size="lg" placeholder="optional callback" />
              </div>
            </div>
            <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-elevated/20 px-4 py-3">
              <span class="text-sm text-toned">Dry run</span>
              <UToggle v-model="generateForm.imageDryRun" />
            </label>
          </template>

          <template v-else>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Prompt</label>
              <textarea v-model="generateForm.videoPrompt" class="min-h-[160px] w-full rounded-2xl border border-default bg-elevated/20 px-4 py-3 text-sm text-toned outline-none" />
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Image asset ID</label>
                <UInput v-model="generateForm.videoImageAssetId" class="w-full" size="lg" placeholder="optional asset id" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Image URL</label>
                <UInput v-model="generateForm.videoImageUrl" class="w-full" size="lg" placeholder="optional image url" />
              </div>
            </div>
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Duration</label>
                <USelect v-model="generateForm.videoDurationSeconds" class="w-full" size="lg" :items="[{ label: '5s', value: 5 }, { label: '10s', value: 10 }]" value-key="value" label-key="label" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Quality</label>
                <USelect v-model="generateForm.videoQuality" class="w-full" size="lg" :items="[{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }]" value-key="value" label-key="label" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Aspect ratio</label>
                <USelect v-model="generateForm.videoAspectRatio" class="w-full" size="lg" :items="videoAspectRatioOptions" value-key="value" label-key="label" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-toned">Template version</label>
                <UInput v-model="generateForm.videoTemplateVersion" class="w-full" size="lg" placeholder="optional" />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Callback URL</label>
              <UInput v-model="generateForm.videoCallbackUrl" class="w-full" size="lg" placeholder="optional callback" />
            </div>
            <label class="flex items-center justify-between gap-3 rounded-2xl border border-default bg-elevated/20 px-4 py-3">
              <span class="text-sm text-toned">Dry run</span>
              <UToggle v-model="generateForm.videoDryRun" />
            </label>
          </template>

          <div class="flex flex-wrap gap-2">
            <UButton color="primary" variant="soft" size="lg" @click="submitGenerate" :loading="submitting" loading-icon="">Generate sekarang</UButton>
            <UButton color="neutral" variant="soft" size="lg" @click="loadLibrary" :loading="loading" loading-icon="">Refresh library</UButton>
          </div>
        </div>
      </article>

      <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
        <AppSectionHeading eyebrow="Filter" title="Cari dan saring asset" />
        <div class="mt-5 grid gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium text-toned">Tipe asset</label>
            <USelect v-model="assetType" class="w-full" size="lg" :items="assetTypeOptions" value-key="value" label-key="label" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-toned">Cari creative</label>
            <UInput v-model="search" class="w-full" size="lg" data-testid="creatives-search" placeholder="Cari title, provider, mime, atau prompt version..." />
          </div>
        </div>
      </article>
    </section>

    <div v-if="loading && !library" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat creative library...
    </div>

    <section v-else-if="filteredItems.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="item in filteredItems" :key="item.id" class="overflow-hidden rounded-2xl border border-default bg-default shadow-xs">
        <div class="aspect-video bg-elevated/40">
          <img
            v-if="item.assetType === 'image' && (item.thumbnailUrl || item.originalUrl)"
            :src="item.thumbnailUrl || item.originalUrl || undefined"
            :alt="item.title || item.id"
            class="h-full w-full object-cover"
            loading="lazy"
          />
          <img
            v-else-if="item.assetType === 'video' && item.thumbnailUrl"
            :src="item.thumbnailUrl"
            :alt="item.title || item.id"
            class="h-full w-full object-cover"
            loading="lazy"
          />
          <div v-else class="flex h-full items-center justify-center text-sm text-muted">No preview</div>
        </div>

        <div class="space-y-4 p-5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-highlighted break-words">{{ item.title || item.id }}</h2>
              <div class="mt-1 text-sm text-muted break-all">{{ item.provider }} · {{ item.assetType }}</div>
            </div>
            <AppStatusBadge class="shrink-0" :value="item.status" />
          </div>

          <div class="flex flex-wrap gap-2">
            <UBadge class="max-w-full break-all" color="neutral" variant="soft">{{ item.mimeType || 'No mime' }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ item.width || '—' }} × {{ item.height || '—' }}</UBadge>
            <UBadge v-if="item.durationSeconds" color="warning" variant="soft">{{ item.durationSeconds }}s</UBadge>
          </div>

          <dl class="grid gap-2 text-sm">
            <div class="flex items-start justify-between gap-3">
              <dt class="text-muted">Provider asset</dt>
              <dd class="text-right text-toned break-all">{{ item.providerAssetId || '—' }}</dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-muted">Prompt version</dt>
              <dd class="text-right text-toned break-all">{{ item.promptVersion || '—' }}</dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-muted">Updated</dt>
              <dd class="text-right text-toned">{{ formatDateTime(item.updatedAt) }}</dd>
            </div>
          </dl>

          <div class="flex flex-wrap gap-2">
            <UButton v-if="item.originalUrl" color="primary" variant="soft" size="sm" :href="item.originalUrl" target="_blank">Buka asset</UButton>
            <UButton v-if="item.thumbnailUrl" color="neutral" variant="soft" size="sm" :href="item.thumbnailUrl" target="_blank">Buka preview</UButton>
            <UButton color="error" variant="soft" size="sm" :loading="deletingId === item.id" loading-icon="" @click="deleteAsset(item.id)">Hapus</UButton>
          </div>
        </div>
      </article>
    </section>

    <AppEmptyState
      v-else
      title="Creative belum tersedia"
      description="Belum ada asset yang cocok dengan filter saat ini."
    />
  </div>
</template>
