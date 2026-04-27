export type ModuleInventoryItem = {
  id: string;
  routes: string[];
  auth: 'public' | 'internal' | 'dashboard-session';
};

export const moduleInventory: ModuleInventoryItem[] = [
  { id: 'health', routes: ['/health'], auth: 'public' },
  { id: 'foundation-internal', routes: ['/internal/foundation/*'], auth: 'internal' },
  { id: 'foundation-settings', routes: ['/settings/*'], auth: 'internal' },
  { id: 'asset-generation', routes: ['/asset-generation/*'], auth: 'internal' },
  { id: 'copywriting-lab', routes: ['/copywriting/*'], auth: 'internal' },
  { id: 'dashboard-monitoring', routes: ['/dashboard', '/dashboard/*'], auth: 'dashboard-session' },
  { id: 'providers-internal', routes: ['/internal/providers/*'], auth: 'internal' },
  { id: 'analysis', routes: ['/analysis/*'], auth: 'internal' },
  { id: 'agent-api', routes: ['/agent-api/*'], auth: 'internal' },
  { id: 'start-stop-ads', routes: ['/start-stop-ads/*'], auth: 'internal' },
  { id: 'budget-control', routes: ['/budget-control/*'], auth: 'internal' }
];

