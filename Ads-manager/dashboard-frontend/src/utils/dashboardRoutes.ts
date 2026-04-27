import type { RouteLocationRaw } from 'vue-router'

export const dashboardRouteNames = {
  login: 'login',
  overview: 'overview',
  campaigns: 'campaigns',
  audiences: 'audiences',
  creatives: 'creatives',
  workflows: 'workflows',
  settings: 'settings'
} as const

export type DashboardRouteName = typeof dashboardRouteNames[keyof typeof dashboardRouteNames]

export const dashboardRoutes: Record<DashboardRouteName, RouteLocationRaw> = {
  login: { name: dashboardRouteNames.login },
  overview: { name: dashboardRouteNames.overview },
  campaigns: { name: dashboardRouteNames.campaigns },
  audiences: { name: dashboardRouteNames.audiences },
  creatives: { name: dashboardRouteNames.creatives },
  workflows: { name: dashboardRouteNames.workflows },
  settings: { name: dashboardRouteNames.settings }
}
