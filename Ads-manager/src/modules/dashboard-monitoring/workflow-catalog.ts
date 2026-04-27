export interface DashboardWorkflowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    label: string;
    detail?: string;
    tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  };
}

export interface DashboardWorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface DashboardWorkflowDefinition {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  nodes: DashboardWorkflowNode[];
  edges: DashboardWorkflowEdge[];
}

export const dashboardWorkflowCatalog: DashboardWorkflowDefinition[] = [
  {
    id: 'meta-sync-hierarchy',
    title: 'Meta hierarchy sync',
    summary: 'Ambil snapshot account, campaign, ad set, dan ad dari Meta lalu simpan ke database lokal untuk dipakai dashboard dan operasi berikutnya.',
    tags: ['meta', 'sync', 'snapshot'],
    nodes: [
      { id: 'cron', position: { x: 40, y: 180 }, data: { label: 'Worker job', detail: 'meta.sync.hierarchy', tone: 'primary' } },
      { id: 'meta', position: { x: 360, y: 80 }, data: { label: 'Meta API', detail: 'account + hierarchy pull', tone: 'success' } },
      { id: 'normalize', position: { x: 700, y: 180 }, data: { label: 'Normalize payload', detail: 'map status, budget, ids', tone: 'neutral' } },
      { id: 'db', position: { x: 1040, y: 80 }, data: { label: 'Snapshot tables', detail: 'campaign / ad set / ad', tone: 'warning' } },
      { id: 'dashboard', position: { x: 1380, y: 180 }, data: { label: 'Dashboard read model', detail: 'overview + drilldown', tone: 'primary' } }
    ],
    edges: [
      { id: 'e1', source: 'cron', target: 'meta', label: 'fetch', animated: true },
      { id: 'e2', source: 'meta', target: 'normalize', label: 'raw payload' },
      { id: 'e3', source: 'normalize', target: 'db', label: 'upsert snapshots' },
      { id: 'e4', source: 'db', target: 'dashboard', label: 'query' }
    ]
  },
  {
    id: 'creative-image-generation',
    title: 'Creative image generation',
    summary: 'Generate image melalui KIE, poll/callback status task, lalu simpan hasil ke asset library supaya bisa dipakai ulang.',
    tags: ['creative', 'image', 'kie'],
    nodes: [
      { id: 'brief', position: { x: 40, y: 180 }, data: { label: 'Creative brief', detail: 'prompt + metadata', tone: 'primary' } },
      { id: 'submit', position: { x: 360, y: 80 }, data: { label: 'Submit task', detail: 'KIE image generation', tone: 'success' } },
      { id: 'queue', position: { x: 700, y: 180 }, data: { label: 'Polling / callback', detail: 'wait result', tone: 'warning' } },
      { id: 'asset', position: { x: 1040, y: 80 }, data: { label: 'Asset library', detail: 'store generated creative', tone: 'neutral' } },
      { id: 'creative-page', position: { x: 1380, y: 180 }, data: { label: 'Creative library page', detail: 'review / reuse asset', tone: 'primary' } }
    ],
    edges: [
      { id: 'e1', source: 'brief', target: 'submit', label: 'create task' },
      { id: 'e2', source: 'submit', target: 'queue', label: 'track status', animated: true },
      { id: 'e3', source: 'queue', target: 'asset', label: 'store output' },
      { id: 'e4', source: 'asset', target: 'creative-page', label: 'list assets' }
    ]
  },
  {
    id: 'dashboard-access-control',
    title: 'Dashboard access control',
    summary: 'Login dashboard memverifikasi credential, menerbitkan signed session cookie, lalu setiap page/API dashboard membaca session itu sebelum mengembalikan data.',
    tags: ['auth', 'dashboard', 'security'],
    nodes: [
      { id: 'login', position: { x: 40, y: 180 }, data: { label: 'Login form', detail: 'username + password', tone: 'primary' } },
      { id: 'verify', position: { x: 360, y: 80 }, data: { label: 'Verify auth', detail: 'rate limit + password hash', tone: 'success' } },
      { id: 'cookie', position: { x: 700, y: 180 }, data: { label: 'Issue session cookie', detail: 'signed + httpOnly', tone: 'warning' } },
      { id: 'guard', position: { x: 1040, y: 80 }, data: { label: 'Guard page/API', detail: 'session required', tone: 'neutral' } },
      { id: 'ui', position: { x: 1380, y: 180 }, data: { label: 'Dashboard pages', detail: 'overview / campaigns / settings', tone: 'primary' } }
    ],
    edges: [
      { id: 'e1', source: 'login', target: 'verify', label: 'submit' },
      { id: 'e2', source: 'verify', target: 'cookie', label: 'success' },
      { id: 'e3', source: 'cookie', target: 'guard', label: 'next request' },
      { id: 'e4', source: 'guard', target: 'ui', label: 'authorized' }
    ]
  }
]
