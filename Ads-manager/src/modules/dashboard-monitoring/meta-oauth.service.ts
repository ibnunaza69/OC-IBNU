import { createHmac, randomUUID } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { AppError, type NormalizedErrorCode } from '../../lib/errors.js';
import { httpJson } from '../../lib/http.js';
import { updateDashboardRuntimeConfig, getDashboardRuntimeSecrets } from './runtime-config.js';
import {
  type MetaOAuthAssetItem,
  type MetaOAuthConnectionRecord,
  type MetaOAuthConnectionSelection,
  readMetaOAuthStore,
  writeMetaOAuthStore
} from './meta-oauth.store.js';

interface MetaGraphListResponse<T> {
  data?: T[];
}

interface MetaGraphErrorPayload {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  is_transient?: boolean;
}

interface MetaOAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: MetaGraphErrorPayload;
}

interface MetaOAuthStartResult {
  ok: true;
  authUrl: string;
  state: string;
  redirectUri: string;
  graphApiVersion: string;
  scopes: string[];
}

export interface MetaOAuthSanitizedConnection {
  id: string;
  label: string;
  profileId: string;
  profileName: string;
  tokenType: string | null;
  tokenPreview: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  graphApiVersion: string;
  createdAt: string;
  updatedAt: string;
  runtimeBound: boolean;
  adAccounts: MetaOAuthAssetItem[];
  pages: MetaOAuthAssetItem[];
  pixels: MetaOAuthAssetItem[];
  businesses: MetaOAuthAssetItem[];
  selection: MetaOAuthConnectionSelection;
}

interface MetaOAuthCallbackResult {
  ok: true;
  connection: MetaOAuthSanitizedConnection;
}

interface SaveMetaSelectionsInput {
  connectionId: string;
  selection: MetaOAuthConnectionSelection;
  bindRuntime?: boolean | undefined;
}

function normalizeGraphVersion(input: string | null | undefined) {
  const trimmed = input?.trim();
  if (!trimmed) {
    return 'v25.0';
  }

  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

function buildExpiry(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(Date.now() + seconds * 1000).toISOString();
}

function maskToken(token: string) {
  if (token.length <= 12) {
    return `${token.slice(0, 4)}…${token.slice(-2)}`;
  }

  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function uniqById<T extends { id: string; name: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }

  return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeMetaOAuthErrorCode(status: number, metaError?: MetaGraphErrorPayload | null): NormalizedErrorCode {
  if (status === 401 || metaError?.code === 190) {
    return 'AUTH_EXPIRED';
  }

  if (status === 403 || metaError?.code === 10 || metaError?.code === 200) {
    return 'PERMISSION_DENIED';
  }

  if (status === 429 || metaError?.code === 4 || metaError?.code === 17 || metaError?.code === 341) {
    return 'RATE_LIMITED';
  }

  if (status === 400 || status === 422) {
    return 'VALIDATION_ERROR';
  }

  return 'REMOTE_TEMPORARY_FAILURE';
}

function formatMetaOAuthErrorMessage(stage: string, status: number, metaError?: MetaGraphErrorPayload | null) {
  const detailParts = [
    metaError?.message?.trim() ? `Meta: ${metaError.message.trim()}` : null,
    metaError?.type?.trim() ? `type=${metaError.type.trim()}` : null,
    metaError?.code != null ? `code=${metaError.code}` : null,
    metaError?.error_subcode != null ? `subcode=${metaError.error_subcode}` : null,
    metaError?.fbtrace_id?.trim() ? `fbtrace_id=${metaError.fbtrace_id.trim()}` : null
  ].filter(Boolean);

  if (detailParts.length > 0) {
    return `Meta OAuth gagal saat ${stage} (HTTP ${status}). ${detailParts.join(' | ')}`;
  }

  return `Meta OAuth gagal saat ${stage} (HTTP ${status}) dan Meta tidak mengembalikan access token.`;
}

export class MetaOAuthService {
  private readonly defaultScopes = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_show_list',
    'pages_read_engagement'
  ];

  private async getRuntimeSecrets() {
    const secrets = await getDashboardRuntimeSecrets();
    const graphApiVersion = normalizeGraphVersion(secrets.metaGraphApiVersion);

    return {
      ...secrets,
      graphApiVersion
    };
  }

  private async assertConfigured() {
    const secrets = await this.getRuntimeSecrets();

    if (!secrets.metaAppId || !secrets.metaAppSecret || !secrets.metaOAuthRedirectUri) {
      throw new AppError(
        'Meta OAuth belum siap. Isi META_APP_ID, META_APP_SECRET, dan META_OAUTH_REDIRECT_URI di dashboard settings dulu.',
        'VALIDATION_ERROR',
        400
      );
    }

    return secrets;
  }

  private buildAppSecretProof(token: string, appSecret: string) {
    return createHmac('sha256', appSecret).update(token).digest('hex');
  }

  private buildTokenExchangeError(stage: string, status: number, payload: MetaOAuthTokenResponse) {
    const metaError = payload?.error ?? null;

    return new AppError(
      formatMetaOAuthErrorMessage(stage, status, metaError),
      normalizeMetaOAuthErrorCode(status, metaError),
      status >= 400 ? status : 502,
      {
        stage,
        providerStatus: status,
        providerError: metaError,
        providerResponse: payload
      }
    );
  }

  private async graphGet<T>(path: string, accessToken: string, options?: { graphApiVersion?: string; fields?: string; appSecret?: string }) {
    const graphApiVersion = normalizeGraphVersion(options?.graphApiVersion);
    const query = new URLSearchParams({
      access_token: accessToken
    });

    if (options?.fields) {
      query.set('fields', options.fields);
    }

    if (options?.appSecret) {
      query.set('appsecret_proof', this.buildAppSecretProof(accessToken, options.appSecret));
    }

    const response = await httpJson<T>(`https://graph.facebook.com/${graphApiVersion}${path}?${query.toString()}`);
    return response.data;
  }

  private sanitizeConnection(connection: MetaOAuthConnectionRecord): MetaOAuthSanitizedConnection {
    return {
      id: connection.id,
      label: connection.label,
      profileId: connection.profileId,
      profileName: connection.profileName,
      tokenType: connection.tokenType,
      tokenPreview: maskToken(connection.accessToken),
      tokenExpiresAt: connection.tokenExpiresAt,
      scopes: connection.scopes,
      graphApiVersion: connection.graphApiVersion,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      runtimeBound: connection.runtimeBound,
      adAccounts: connection.adAccounts,
      pages: connection.pages,
      pixels: connection.pixels,
      businesses: connection.businesses,
      selection: connection.selection
    };
  }

  private async fetchPixelsForAccounts(accounts: MetaOAuthAssetItem[], accessToken: string, graphApiVersion: string, appSecret: string) {
    const pixels: MetaOAuthAssetItem[] = [];

    await Promise.all(accounts.map(async (account) => {
      const accountId = account.accountId?.trim();
      if (!accountId) {
        return;
      }

      try {
        const result = await this.graphGet<MetaGraphListResponse<{ id: string; name?: string; code?: string }>>(
          `/act_${accountId}/adspixels`,
          accessToken,
          {
            graphApiVersion,
            fields: 'id,name,code',
            appSecret
          }
        );

        for (const pixel of result.data ?? []) {
          if (!pixel.id) {
            continue;
          }

          pixels.push({
            id: pixel.id,
            name: pixel.name?.trim() || pixel.id,
            type: 'pixel',
            code: pixel.code ?? null,
            accountId,
            businessId: account.businessId ?? null,
            businessName: account.businessName ?? null,
            metadata: {
              sourceAccountId: accountId,
              sourceAccountName: account.name
            }
          });
        }
      } catch {
        // ignore per-account pixel read failures so one account does not block the rest
      }
    }));

    return uniqById(pixels);
  }

  private async fetchBusinesses(accessToken: string, graphApiVersion: string, appSecret: string) {
    const businessesResponse = await this.graphGet<MetaGraphListResponse<{ id: string; name?: string; verification_status?: string }>>(
      '/me/businesses',
      accessToken,
      {
        graphApiVersion,
        fields: 'id,name,verification_status',
        appSecret
      }
    );

    return uniqById((businessesResponse.data ?? [])
      .filter((item) => item.id)
      .map((item) => ({
        id: item.id,
        name: item.name?.trim() || item.id,
        type: 'business' as const,
        status: item.verification_status ?? null
      })));
  }

  private async discoverConnectionData(accessToken: string, graphApiVersion: string, appSecret: string) {
    const [profileResponse, adAccountsResponse, pagesResponse, businesses] = await Promise.all([
      this.graphGet<{ id?: string; name?: string }>(
        '/me',
        accessToken,
        { graphApiVersion, fields: 'id,name', appSecret }
      ),
      this.graphGet<MetaGraphListResponse<{ id: string; account_id?: string; name?: string; account_status?: number | string; currency?: string; business?: { id?: string; name?: string } }>>(
        '/me/adaccounts',
        accessToken,
        {
          graphApiVersion,
          fields: 'id,account_id,name,account_status,currency,business{id,name}',
          appSecret
        }
      ),
      this.graphGet<MetaGraphListResponse<{ id: string; name?: string; category?: string; tasks?: string[]; instagram_business_account?: { id?: string; username?: string } }>>(
        '/me/accounts',
        accessToken,
        {
          graphApiVersion,
          fields: 'id,name,category,tasks,instagram_business_account{id,username}',
          appSecret
        }
      ),
      this.fetchBusinesses(accessToken, graphApiVersion, appSecret)
    ]);

    const adAccounts = uniqById((adAccountsResponse.data ?? [])
      .filter((item) => item.id)
      .map((item) => ({
        id: item.id,
        accountId: item.account_id?.trim() || null,
        name: item.name?.trim() || item.account_id?.trim() || item.id,
        type: 'ad-account' as const,
        currency: item.currency ?? null,
        status: item.account_status != null ? String(item.account_status) : null,
        businessId: item.business?.id?.trim() || null,
        businessName: item.business?.name?.trim() || null
      })));

    const pages = uniqById((pagesResponse.data ?? [])
      .filter((item) => item.id)
      .map((item) => ({
        id: item.id,
        name: item.name?.trim() || item.id,
        type: 'page' as const,
        category: item.category ?? null,
        tasks: Array.isArray(item.tasks) ? item.tasks : [],
        metadata: {
          instagramBusinessAccountId: item.instagram_business_account?.id ?? null,
          instagramUsername: item.instagram_business_account?.username ?? null
        }
      })));

    const pixels = await this.fetchPixelsForAccounts(adAccounts, accessToken, graphApiVersion, appSecret);

    return {
      profileId: profileResponse.id?.trim() || 'unknown-profile',
      profileName: profileResponse.name?.trim() || 'Meta User',
      adAccounts,
      pages,
      pixels,
      businesses
    };
  }

  async start(actor = 'dashboard'): Promise<MetaOAuthStartResult> {
    const secrets = await this.assertConfigured();
    const store = await readMetaOAuthStore();
    const state = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    store.pendingStates = [
      ...store.pendingStates.filter((item) => new Date(item.expiresAt).getTime() > now.getTime()),
      {
        state,
        actor,
        createdAt: now.toISOString(),
        expiresAt
      }
    ];

    await writeMetaOAuthStore(store);

    const authUrl = new URL(`https://www.facebook.com/${secrets.graphApiVersion}/dialog/oauth`);
    const metaAppId = secrets.metaAppId!;
    const metaOAuthRedirectUri = secrets.metaOAuthRedirectUri!;
    authUrl.searchParams.set('client_id', metaAppId);
    authUrl.searchParams.set('redirect_uri', metaOAuthRedirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', this.defaultScopes.join(','));
    authUrl.searchParams.set('response_type', 'code');

    return {
      ok: true,
      authUrl: authUrl.toString(),
      state,
      redirectUri: metaOAuthRedirectUri,
      graphApiVersion: secrets.graphApiVersion,
      scopes: this.defaultScopes
    };
  }

  async handleCallback(code: string, state: string): Promise<MetaOAuthCallbackResult> {
    const secrets = await this.assertConfigured();
    const store = await readMetaOAuthStore();
    const pending = store.pendingStates.find((item) => item.state === state);

    if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) {
      throw new AppError('Meta OAuth state invalid atau sudah expired.', 'VALIDATION_ERROR', 400);
    }

    const shortLived = await httpJson<MetaOAuthTokenResponse>(
      `https://graph.facebook.com/${secrets.graphApiVersion}/oauth/access_token?${new URLSearchParams({
        client_id: secrets.metaAppId!,
        client_secret: secrets.metaAppSecret!,
        redirect_uri: secrets.metaOAuthRedirectUri!,
        code
      }).toString()}`
    );

    const shortToken = shortLived.data.access_token?.trim();
    if (!shortToken) {
      throw this.buildTokenExchangeError('menukar authorization code', shortLived.status, shortLived.data);
    }

    const longLived = await httpJson<MetaOAuthTokenResponse>(
      `https://graph.facebook.com/${secrets.graphApiVersion}/oauth/access_token?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: secrets.metaAppId!,
        client_secret: secrets.metaAppSecret!,
        fb_exchange_token: shortToken
      }).toString()}`
    );

    const accessToken = longLived.data.access_token?.trim() || shortToken;
    const tokenType = longLived.data.token_type ?? shortLived.data.token_type ?? null;
    const tokenExpiresAt = buildExpiry(longLived.data.expires_in ?? shortLived.data.expires_in);
    const { profileId, profileName, adAccounts, pages, pixels, businesses } = await this.discoverConnectionData(
      accessToken,
      secrets.graphApiVersion,
      secrets.metaAppSecret!
    );

    const now = new Date().toISOString();
    const existing = store.connections.find((item) => item.profileId === profileId);
    const nextSelection: MetaOAuthConnectionSelection = existing?.selection ?? {
      adAccountIds: adAccounts.map((item) => item.id),
      pageIds: pages.map((item) => item.id),
      pixelIds: pixels.map((item) => item.id),
      businessIds: businesses.map((item) => item.id),
      primaryAdAccountId: adAccounts[0]?.id ?? null
    };

    const connection: MetaOAuthConnectionRecord = {
      id: existing?.id ?? randomUUID(),
      label: `${profileName} (${profileId})`,
      profileId,
      profileName,
      tokenType,
      accessToken,
      tokenExpiresAt,
      scopes: this.defaultScopes,
      graphApiVersion: secrets.graphApiVersion,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      adAccounts,
      pages,
      pixels,
      businesses,
      selection: nextSelection,
      runtimeBound: existing?.runtimeBound ?? false
    };

    store.connections = [
      ...store.connections.filter((item) => item.id !== connection.id && item.profileId !== connection.profileId),
      connection
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    store.pendingStates = store.pendingStates.filter((item) => item.state !== state);

    await writeMetaOAuthStore(store);

    return {
      ok: true,
      connection: this.sanitizeConnection(connection)
    };
  }

  async listConnections() {
    const store = await readMetaOAuthStore();
    return store.connections
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((connection) => this.sanitizeConnection(connection));
  }

  async saveSelections(input: SaveMetaSelectionsInput) {
    const store = await readMetaOAuthStore();
    const connection = store.connections.find((item) => item.id === input.connectionId);

    if (!connection) {
      throw new AppError('Meta connection tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404, {
        connectionId: input.connectionId
      });
    }

    connection.selection = {
      adAccountIds: [...new Set(input.selection.adAccountIds)],
      pageIds: [...new Set(input.selection.pageIds)],
      pixelIds: [...new Set(input.selection.pixelIds)],
      businessIds: [...new Set(input.selection.businessIds)],
      primaryAdAccountId: input.selection.primaryAdAccountId ?? input.selection.adAccountIds[0] ?? null
    };
    connection.runtimeBound = Boolean(input.bindRuntime);
    connection.updatedAt = new Date().toISOString();

    if (input.bindRuntime) {
      const primaryAccount = connection.adAccounts.find((item) => item.id === connection.selection.primaryAdAccountId)
        ?? connection.adAccounts.find((item) => connection.selection.adAccountIds.includes(item.id))
        ?? null;

      await updateDashboardRuntimeConfig({
        metaAccessToken: connection.accessToken,
        metaAdAccountId: primaryAccount?.accountId ?? null
      });
    }

    await writeMetaOAuthStore(store);

    return {
      ok: true,
      connection: this.sanitizeConnection(connection)
    };
  }

  async unbindConnection(connectionId: string) {
    const store = await readMetaOAuthStore();
    const connection = store.connections.find((item) => item.id === connectionId);

    if (!connection) {
      throw new AppError('Meta connection tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404, {
        connectionId
      });
    }

    connection.runtimeBound = false;
    connection.updatedAt = new Date().toISOString();
    await writeMetaOAuthStore(store);

    return {
      ok: true,
      connection: this.sanitizeConnection(connection),
      note: 'Connection berhasil di-unbind dari mode switch berikutnya. Runtime aktif saat ini sengaja tidak diubah otomatis agar flow lama tetap aman.'
    };
  }

  async removeConnection(connectionId: string) {
    const store = await readMetaOAuthStore();
    const connection = store.connections.find((item) => item.id === connectionId);

    if (!connection) {
      throw new AppError('Meta connection tidak ditemukan.', 'RESOURCE_NOT_FOUND', 404, {
        connectionId
      });
    }

    if (connection.runtimeBound) {
      throw new AppError(
        'Connection masih bertanda runtime-bound. Unbind dulu supaya penghapusan tidak berisiko mengacaukan flow aktif.',
        'POLICY_REJECTED',
        409,
        { connectionId }
      );
    }

    store.connections = store.connections.filter((item) => item.id !== connectionId);
    await writeMetaOAuthStore(store);

    return {
      ok: true,
      removedConnectionId: connectionId
    };
  }
}
