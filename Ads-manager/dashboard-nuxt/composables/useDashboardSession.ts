import { computed } from 'vue';

import type { DashboardSessionResponse } from '../types/dashboard';
import { dashboardRoutes } from '../utils/dashboardRoutes';
import { useDashboardApi } from './useDashboardApi';

type Session = DashboardSessionResponse['session'];

export function useDashboardSession() {
  const api = useDashboardApi();
  const session = useState<Session | null>('dashboard:session', () => null);
  const loading = useState<boolean>('dashboard:session-loading', () => false);
  const hydrated = useState<boolean>('dashboard:session-hydrated', () => false);

  const isAuthenticated = computed(() => Boolean(session.value));

  async function hydrate(options?: { redirectOnFail?: boolean }) {
    if (loading.value) {
      return session.value;
    }

    loading.value = true;

    try {
      const { response, payload } = await api.getSession({ redirectOn401: false });
      if (!response.ok || !payload?.ok) {
        session.value = null;
        hydrated.value = true;
        if (options?.redirectOnFail) {
          await navigateTo(dashboardRoutes.login);
        }
        return null;
      }

      session.value = payload.session ?? null;
      hydrated.value = true;
      return session.value;
    } catch {
      session.value = null;
      hydrated.value = true;
      if (options?.redirectOnFail) {
        await navigateTo(dashboardRoutes.login);
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    await api.logout();
    session.value = null;
    hydrated.value = false;
    await navigateTo(dashboardRoutes.login);
  }

  return {
    session,
    loading,
    hydrated,
    isAuthenticated,
    hydrate,
    logout
  };
}

