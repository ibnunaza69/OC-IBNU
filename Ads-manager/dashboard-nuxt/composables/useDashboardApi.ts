import type {
  DashboardAdDetailResponse,
  DashboardAudienceListResponse,
  DashboardCampaignHierarchyResponse,
  DashboardCampaignSyncResponse,
  DashboardCreativeDeleteResponse,
  type DashboardCreativeGenerateRequest,
  DashboardCreativeGenerateResponse,
  DashboardCreativeLibraryResponse,
  DashboardMetaActionResponse,
  DashboardMetaConnectionMutationResponse,
  DashboardMetaOAuthStartResponse,
  type DashboardMetaSelectionSaveRequest,
  DashboardLoginResponse,
  DashboardSessionResponse,
  DashboardSettingsResponse,
  type DashboardSettingsUpdateRequest,
  DashboardSummaryResponse,
  DashboardWorkflowResponse
} from '../types/dashboard';

type JsonResult<T> = {
  response: { ok: boolean; status: number };
  payload: T | null;
};

function useToastOnce() {
  const toast = useToast();
  const lastAt = useState<number>('dashboard:last-toast-at', () => 0);

  return (message: string) => {
    const now = Date.now();
    if (now - lastAt.value < 1500) {
      return;
    }
    lastAt.value = now;
    toast.add({ title: message, color: 'error' });
  };
}

async function requestJson<T>(path: string, init?: Parameters<typeof $fetch.raw<T>>[1] & { redirectOn401?: boolean }): Promise<JsonResult<T>> {
  const toastOnce = useToastOnce();
  const response = await $fetch.raw<T>(path, {
    ...init,
    baseURL: '/dashboard/',
    credentials: 'same-origin',
    ignoreResponseError: true
  });

  const ok = response.status >= 200 && response.status < 300;
  const payload = (response._data ?? null) as T | null;

  if (!ok && response.status === 401 && init?.redirectOn401 !== false) {
    await navigateTo('/login');
  }

  if (!ok && response.status >= 500) {
    toastOnce('Terjadi gangguan sistem.');
  }

  return { response: { ok, status: response.status }, payload };
}

export function useDashboardApi() {
  return {
    requestJson,
    getSession: (options?: { redirectOn401?: boolean }) => requestJson<DashboardSessionResponse>('api/session', options),
    getSummary: () => requestJson<DashboardSummaryResponse>('api/summary'),
    getCampaignHierarchy: (limit = 50) => requestJson<DashboardCampaignHierarchyResponse>(`api/campaigns/hierarchy?limit=${limit}`),
    getAudiences: (params?: { limit?: number; type?: 'all' | 'custom' | 'lookalike' }) => {
      const query = new URLSearchParams();
      query.set('limit', String(params?.limit ?? 50));
      query.set('type', params?.type ?? 'all');
      return requestJson<DashboardAudienceListResponse>(`api/audiences?${query.toString()}`);
    },
    syncCampaignHierarchy: (limit = 50) => requestJson<DashboardCampaignSyncResponse>('api/campaigns/sync', {
      method: 'POST',
      body: { limit }
    }),
    getAdDetail: (adId: string) => requestJson<DashboardAdDetailResponse>(`api/ads/${adId}/detail`),
    duplicateCampaign: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/campaigns/${campaignId}/duplicate`, {
      method: 'POST',
      body
    }),
    duplicateCampaignTree: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/campaigns/${campaignId}/duplicate-tree`, {
      method: 'POST',
      body
    }),
    deleteCampaign: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/campaigns/${campaignId}/delete`, {
      method: 'POST',
      body
    }),
    duplicateAdSet: (adSetId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/adsets/${adSetId}/duplicate`, {
      method: 'POST',
      body
    }),
    deleteAdSet: (adSetId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/adsets/${adSetId}/delete`, {
      method: 'POST',
      body
    }),
    inspectAdPromotability: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/ads/${adId}/promotability`, {
      method: 'POST',
      body
    }),
    preflightDuplicateAd: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/ads/${adId}/preflight/duplicate`, {
      method: 'POST',
      body
    }),
    duplicateAd: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`api/ads/${adId}/duplicate`, {
      method: 'POST',
      body
    }),
    getCreativeLibrary: (params?: { limit?: number; assetType?: 'all' | 'image' | 'video' }) => {
      const query = new URLSearchParams();
      query.set('limit', String(params?.limit ?? 50));
      query.set('assetType', params?.assetType ?? 'all');
      return requestJson<DashboardCreativeLibraryResponse>(`api/creatives?${query.toString()}`);
    },
    getWorkflows: () => requestJson<DashboardWorkflowResponse>('api/workflows'),
    getSettings: () => requestJson<DashboardSettingsResponse>('api/settings'),
    updateSettings: (body: DashboardSettingsUpdateRequest) => requestJson<DashboardSettingsResponse>('api/settings', {
      method: 'POST',
      body
    }),
    startMetaOAuth: () => requestJson<DashboardMetaOAuthStartResponse>('api/meta/oauth/start'),
    saveMetaSelections: (connectionId: string, body: DashboardMetaSelectionSaveRequest) => requestJson<DashboardMetaConnectionMutationResponse>(`api/meta/connections/${connectionId}/selections`, {
      method: 'POST',
      body
    }),
    unbindMetaConnection: (connectionId: string) => requestJson<DashboardMetaConnectionMutationResponse>(`api/meta/connections/${connectionId}/unbind`, {
      method: 'POST'
    }),
    removeMetaConnection: (connectionId: string) => requestJson<DashboardMetaConnectionMutationResponse>(`api/meta/connections/${connectionId}`, {
      method: 'DELETE'
    }),
    generateCreative: (body: DashboardCreativeGenerateRequest) => requestJson<DashboardCreativeGenerateResponse>('api/creatives/generate', {
      method: 'POST',
      body
    }),
    deleteCreative: (assetId: string) => requestJson<DashboardCreativeDeleteResponse>(`api/creatives/${assetId}`, {
      method: 'DELETE'
    }),
    login: (username: string, password: string) => requestJson<DashboardLoginResponse>('login', {
      method: 'POST',
      body: { username, password },
      redirectOn401: false
    }),
    logout: () => requestJson<DashboardLoginResponse>('logout', {
      method: 'POST',
      body: {},
      redirectOn401: false
    })
  };
}
