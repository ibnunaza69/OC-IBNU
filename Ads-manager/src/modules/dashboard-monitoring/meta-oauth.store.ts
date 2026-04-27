import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface MetaOAuthAssetItem {
  id: string;
  name: string;
  type: 'ad-account' | 'page' | 'pixel' | 'business';
  accountId?: string | null;
  category?: string | null;
  currency?: string | null;
  status?: string | null;
  tasks?: string[];
  businessId?: string | null;
  businessName?: string | null;
  code?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MetaOAuthConnectionSelection {
  adAccountIds: string[];
  pageIds: string[];
  pixelIds: string[];
  businessIds: string[];
  primaryAdAccountId: string | null;
}

export interface MetaOAuthConnectionRecord {
  id: string;
  label: string;
  profileId: string;
  profileName: string;
  tokenType: string | null;
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  graphApiVersion: string;
  createdAt: string;
  updatedAt: string;
  adAccounts: MetaOAuthAssetItem[];
  pages: MetaOAuthAssetItem[];
  pixels: MetaOAuthAssetItem[];
  businesses: MetaOAuthAssetItem[];
  selection: MetaOAuthConnectionSelection;
  runtimeBound: boolean;
}

export interface MetaOAuthPendingState {
  state: string;
  actor: string;
  createdAt: string;
  expiresAt: string;
}

export interface MetaOAuthStoreSnapshot {
  pendingStates: MetaOAuthPendingState[];
  connections: MetaOAuthConnectionRecord[];
}

const STORE_PATH = resolve(process.cwd(), '.runtime/meta-oauth-store.json');

function buildEmptyStore(): MetaOAuthStoreSnapshot {
  return {
    pendingStates: [],
    connections: []
  };
}

async function ensureStoreDir() {
  await mkdir(resolve(process.cwd(), '.runtime'), { recursive: true });
}

export async function readMetaOAuthStore() {
  await ensureStoreDir();

  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MetaOAuthStoreSnapshot>;

    return {
      pendingStates: Array.isArray(parsed.pendingStates) ? parsed.pendingStates : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : []
    } satisfies MetaOAuthStoreSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return buildEmptyStore();
    }

    throw error;
  }
}

export async function writeMetaOAuthStore(store: MetaOAuthStoreSnapshot) {
  await ensureStoreDir();
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export function getMetaOAuthStorePath() {
  return STORE_PATH;
}
