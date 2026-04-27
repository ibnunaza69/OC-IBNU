<script setup lang="ts">
import { computed, ref } from 'vue';

import AppIcon from '../components/AppIcon.vue';
import AppThemeSwitcher from '../components/AppThemeSwitcher.vue';
import { useDashboardSession } from '../composables/useDashboardSession';
import { useDashboardTheme } from '../composables/useDashboardTheme';
import { dashboardRouteNames, dashboardRoutes } from '../utils/dashboardRoutes';

const route = useRoute();
const sidebarOpen = ref(false);
const { session, logout } = useDashboardSession();
useDashboardTheme();

const navItems = computed(() => [
  {
    label: 'Overview',
    icon: 'layout-dashboard',
    routeName: dashboardRouteNames.overview,
    to: dashboardRoutes.overview
  },
  {
    label: 'Campaigns',
    icon: 'megaphone',
    routeName: dashboardRouteNames.campaigns,
    to: dashboardRoutes.campaigns
  },
  {
    label: 'Audiences',
    icon: 'users',
    routeName: dashboardRouteNames.audiences,
    to: dashboardRoutes.audiences
  },
  {
    label: 'Creatives',
    icon: 'images',
    routeName: dashboardRouteNames.creatives,
    to: dashboardRoutes.creatives
  },
  {
    label: 'Workflows',
    icon: 'workflow',
    routeName: dashboardRouteNames.workflows,
    to: dashboardRoutes.workflows
  },
  {
    label: 'Settings',
    icon: 'settings-2',
    routeName: dashboardRouteNames.settings,
    to: dashboardRoutes.settings
  }
] as const);

function isRouteActive(routeName: string) {
  return route.name === routeName;
}

function closeSidebar() {
  sidebarOpen.value = false;
}

const currentTitle = computed(() => {
  switch (route.name) {
    case 'campaigns': return 'Campaigns';
    case 'audiences': return 'Audiences';
    case 'creatives': return 'Creatives';
    case 'workflows': return 'Workflows';
    case 'settings': return 'Settings';
    default: return 'Overview';
  }
});
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      v-model:open="sidebarOpen"
      collapsible
      class="bg-default"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-3 px-1">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15">
            <AppIcon name="badge-dollar-sign" class="size-5" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <div class="flex items-center gap-2">
              <div class="text-sm font-semibold text-highlighted">Ops Dashboard</div>
            </div>
            <div class="text-xs text-muted">Dashboard</div>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <div class="mt-2 space-y-1">
          <UButton
            v-for="item in navItems"
            :key="item.routeName"
            :to="item.to"
            :data-testid="`nav-${item.routeName}`"
            :square="collapsed"
            :block="!collapsed"
            size="lg"
            :color="isRouteActive(item.routeName) ? 'primary' : 'neutral'"
            :variant="isRouteActive(item.routeName) ? 'soft' : 'ghost'"
            class="justify-start"
            :aria-label="item.label"
            @click="closeSidebar"
          >
            <template #leading>
              <AppIcon :name="item.icon" class="size-4" />
            </template>
            <template v-if="!collapsed">{{ item.label }}</template>
          </UButton>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <div class="space-y-3">
          <div v-if="!collapsed" class="text-sm font-medium text-highlighted">
            {{ session?.username ?? 'user' }}
          </div>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :square="collapsed"
              block
              aria-label="Refresh dashboard"
              @click="() => window.location.reload()"
            >
              <template #leading>
                <AppIcon name="refresh-cw" class="size-4" />
              </template>
              <template v-if="!collapsed">Refresh</template>
            </UButton>
            <UButton
              color="error"
              variant="soft"
              :square="collapsed"
              block
              aria-label="Logout"
              @click="logout"
            >
              <template #leading>
                <AppIcon name="log-out" class="size-4" />
              </template>
              <template v-if="!collapsed">Logout</template>
            </UButton>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :id="String(route.name ?? 'dashboard')" data-testid="dashboard-layout">
      <template #header>
        <UDashboardNavbar :title="currentTitle" :ui="{ right: 'gap-2' }">
          <template #leading>
            <UDashboardSidebarCollapse icon="" label="Sidebar" />
          </template>

          <template #right>
            <AppThemeSwitcher />
            <UBadge color="neutral" variant="soft">
              {{ session?.username ?? 'user' }}
            </UBadge>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

