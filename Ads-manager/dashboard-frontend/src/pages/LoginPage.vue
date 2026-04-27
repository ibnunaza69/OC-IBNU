<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppThemeSwitcher from '../components/AppThemeSwitcher.vue'
import { useDashboardApi } from '../composables/useDashboardApi'
import { useDashboardSession } from '../composables/useDashboardSession'
import { useDashboardTheme } from '../composables/useDashboardTheme'
import { dashboardRoutes } from '../utils/dashboardRoutes'

const router = useRouter()
const api = useDashboardApi()
const { hydrate } = useDashboardSession()
useDashboardTheme()

const loginForm = ref({ username: '', password: '' })
const loginLoading = ref(false)
const loginError = ref('')

async function submitLogin() {
  loginLoading.value = true
  loginError.value = ''

  try {
    const { response, payload } = await api.login(loginForm.value.username, loginForm.value.password)

    if (!response.ok || !payload?.ok) {
      loginError.value = payload?.error?.message ?? 'Login gagal.'
      return
    }

    await router.replace(payload.redirectTo ?? dashboardRoutes.overview)
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : 'Login gagal.'
  } finally {
    loginLoading.value = false
  }
}

onMounted(async () => {
  const session = await hydrate()
  if (session) {
    await router.replace(dashboardRoutes.overview)
  }
})
</script>

<template>
  <div class="min-h-screen bg-default">
    <div class="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div class="hidden border-r border-default bg-default p-10 lg:flex lg:flex-col lg:justify-between">
        <div class="space-y-6">
          <UBadge color="primary" variant="subtle" size="lg">Meta Ads Monitoring</UBadge>
          <div class="space-y-3">
            <h1 class="max-w-xl text-4xl font-semibold tracking-tight text-highlighted">
              Dashboard operasi Meta Ads.
            </h1>
            <p class="max-w-xl text-base leading-7 text-muted">
              Masuk untuk akses operasional.
            </p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-default bg-default/70 p-5">
            <div class="text-sm font-medium text-toned">Campaign explorer</div>
            <div class="mt-2 text-lg font-semibold text-highlighted">Drilldown hierarchy</div>
            <p class="mt-2 text-sm text-muted">Drilldown campaign hingga level ad.</p>
          </div>
          <div class="rounded-2xl border border-default bg-default/70 p-5">
            <div class="text-sm font-medium text-toned">Workflow view</div>
            <div class="mt-2 text-lg font-semibold text-highlighted">Visual flow</div>
            <p class="mt-2 text-sm text-muted">Lihat alur workflow operasional secara visual.</p>
          </div>
        </div>
      </div>

      <div class="relative flex min-h-screen items-center justify-center p-6 sm:p-10">
        <div class="absolute right-6 top-6 z-10 hidden lg:block">
          <AppThemeSwitcher />
        </div>

        <div class="w-full max-w-md rounded-3xl border border-default bg-default p-6 shadow-sm sm:p-8">
          <div class="space-y-3">
            <UBadge color="neutral" variant="soft">Meta Ads Monitoring</UBadge>
            <h2 class="text-2xl font-semibold text-highlighted">Masuk ke dashboard</h2>
            <p class="text-sm leading-6 text-muted">
              Gunakan akun dashboard untuk akses modul operasional.
            </p>
          </div>

          <form class="mt-8 space-y-5" data-testid="login-form" @submit.prevent="submitLogin">
            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Username</label>
              <UInput v-model="loginForm.username" class="w-full" size="lg" data-testid="login-username" placeholder="admin" autocomplete="username" />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-toned">Password</label>
              <UInput v-model="loginForm.password" class="w-full" size="lg" data-testid="login-password" type="password" placeholder="••••••••" autocomplete="current-password" />
            </div>

            <UAlert v-if="loginError" color="error" variant="soft" title="Login gagal" :description="loginError" />

            <UButton type="submit" color="primary" size="lg" block data-testid="login-submit" :loading="loginLoading" loading-icon="">
              {{ loginLoading ? 'Masuk...' : 'Masuk ke dashboard' }}
            </UButton>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
