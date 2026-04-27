export const dashboardRouteNames = {
  login: 'login',
  overview: 'overview',
  campaigns: 'campaigns',
  audiences: 'audiences',
  creatives: 'creatives',
  workflows: 'workflows',
  settings: 'settings'
} as const;

export type DashboardRouteName = typeof dashboardRouteNames[keyof typeof dashboardRouteNames];

export const dashboardRoutes: Record<DashboardRouteName, string> = {
  login: '/login',
  overview: '/overview',
  campaigns: '/campaigns',
  audiences: '/audiences',
  creatives: '/creatives',
  workflows: '/workflows',
  settings: '/settings'
};

