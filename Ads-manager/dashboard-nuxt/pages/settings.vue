<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppEmptyState from '../components/AppEmptyState.vue';
import AppSectionHeading from '../components/AppSectionHeading.vue';
import AppStatusBadge from '../components/AppStatusBadge.vue';
import { useDashboardApi } from '../composables/useDashboardApi';
import type { DashboardSettingsResponse } from '../types/dashboard';

definePageMeta({ layout: 'dashboard' });

const api = useDashboardApi();

const loading = ref(false);
const error = ref('');
const settings = ref<DashboardSettingsResponse | null>(null);

const reason = ref('');

const metaState = computed(() => settings.value?.providers.meta);
const kieState = computed(() => settings.value?.providers.kie);

async function loadSettings() {
  loading.value = true;
  error.value = '';

  try {
    const { response, payload } = await api.getSettings();
    if (!response.ok || !payload?.ok) {
      throw new Error('Gagal memuat settings.');
    }
    settings.value = payload;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal memuat settings.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <div class="space-y-6 p-5 sm:p-8" data-testid="settings-page">
    <section class="rounded-3xl border border-default bg-default p-6 sm:p-7">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <AppSectionHeading
          eyebrow="Runtime"
          title="Settings"
          description="Status konfigurasi runtime dan koneksi provider."
        />

        <UButton color="neutral" variant="soft" size="lg" :loading="loading" loading-icon="" @click="loadSettings">
          Refresh
        </UButton>
      </div>
    </section>

    <UAlert v-if="error" color="error" variant="soft" title="Settings gagal dimuat" :description="error" />

    <div v-if="loading && !settings" class="rounded-2xl border border-default bg-default p-8 text-sm text-muted">
      Memuat settings...
    </div>

    <template v-else-if="settings">
      <section class="grid gap-4 xl:grid-cols-2">
        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-highlighted">Dashboard</div>
              <div class="text-sm text-muted">Kontrol autentikasi dan sesi.</div>
            </div>
            <AppStatusBadge :value="settings.dashboard.authEnabled" />
          </div>

          <dl class="mt-5 grid gap-3 text-sm">
            <div class="flex items-start justify-between gap-3 rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <dt class="text-muted">Auth</dt>
              <dd class="text-right font-medium text-toned">{{ settings.dashboard.authEnabled ? 'enabled' : 'disabled' }}</dd>
            </div>
            <div class="flex items-start justify-between gap-3 rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <dt class="text-muted">Secure cookie</dt>
              <dd class="text-right font-medium text-toned">{{ settings.dashboard.secureCookie ? 'enabled' : 'disabled' }}</dd>
            </div>
            <div class="flex items-start justify-between gap-3 rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <dt class="text-muted">Session TTL</dt>
              <dd class="text-right font-medium text-toned">{{ settings.dashboard.sessionTtlSeconds }}s</dd>
            </div>
          </dl>
        </article>

        <article class="rounded-2xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-highlighted">Providers</div>
              <div class="text-sm text-muted">Kesiapan koneksi provider utama.</div>
            </div>
          </div>

          <div class="mt-5 grid gap-3">
            <div class="rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-highlighted">Meta</div>
                  <div class="text-sm text-muted">{{ metaState?.adAccountId || 'No ad account' }}</div>
                </div>
                <AppStatusBadge :value="metaState?.tokenConfigured ?? false" />
              </div>
            </div>

            <div class="rounded-2xl border border-default bg-elevated/25 px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-medium text-highlighted">KIE</div>
                  <div class="text-sm text-muted">{{ kieState?.callbackUrl || 'No callback' }}</div>
                </div>
                <AppStatusBadge :value="kieState?.apiKeyConfigured ?? false" />
              </div>
            </div>
          </div>
        </article>
      </section>

    </template>

    <AppEmptyState
      v-else
      title="Settings belum tersedia"
      description="Belum ada data settings yang bisa ditampilkan."
    />

    <section class="rounded-2xl border border-default bg-default p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-highlighted">Reason</div>
          <div class="text-sm text-muted">Catatan perubahan (wajib saat submit perubahan).</div>
        </div>
        <UBadge color="neutral" variant="soft">Draft</UBadge>
      </div>

      <div class="mt-4">
        <textarea
          v-model="reason"
          rows="4"
          placeholder="Tulis reason..."
          data-testid="settings-reason"
          class="w-full rounded-xl border border-default bg-default px-4 py-3 text-sm text-highlighted shadow-xs outline-none ring-0 transition focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
        />
      </div>
    </section>
  </div>
</template>
