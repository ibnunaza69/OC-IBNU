import { dashboardRoutes } from '../utils/dashboardRoutes';

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === dashboardRoutes.login) {
    return;
  }

  const { hydrated, loading, isAuthenticated, hydrate } = useDashboardSession();

  if (!hydrated.value && !loading.value) {
    await hydrate();
  }

  if (!isAuthenticated.value) {
    return navigateTo(dashboardRoutes.login);
  }
});

