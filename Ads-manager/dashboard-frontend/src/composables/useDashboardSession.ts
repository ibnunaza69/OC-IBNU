import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useDashboardApi } from './useDashboardApi'
import type { DashboardSessionResponse } from '../types/dashboard'
import { dashboardRoutes } from '../utils/dashboardRoutes'

const session = ref<DashboardSessionResponse['session'] | null>(null)
const loading = ref(false)
const hydrated = ref(false)

export function useDashboardSession() {
  const api = useDashboardApi()
  const router = useRouter()

  const isAuthenticated = computed(() => Boolean(session.value))

  async function hydrate(options?: { redirectOnFail?: boolean }) {
    if (loading.value) {
      return session.value
    }

    loading.value = true

    try {
      const { response, payload } = await api.getSession()
      if (!response.ok || !payload?.ok) {
        session.value = null
        if (options?.redirectOnFail) {
          await router.replace(dashboardRoutes.login)
        }
        return null
      }

      session.value = payload.session ?? null
      hydrated.value = true
      return session.value
    } catch {
      session.value = null
      if (options?.redirectOnFail) {
        await router.replace(dashboardRoutes.login)
      }
      return null
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await api.logout()
    session.value = null
    hydrated.value = false
    await router.replace(dashboardRoutes.login)
  }

  return {
    session,
    loading,
    hydrated,
    isAuthenticated,
    hydrate,
    logout
  }
}
