import type {
  DashboardAdDetailResponse,
  DashboardAudienceListResponse,
  DashboardCampaignHierarchyResponse,
  DashboardCampaignSyncResponse,
  DashboardCreativeDeleteResponse,
  DashboardCreativeGenerateRequest,
  DashboardCreativeGenerateResponse,
  DashboardCreativeLibraryResponse,
  DashboardMetaActionResponse,
  DashboardMetaConnectionMutationResponse,
  DashboardMetaOAuthStartResponse,
  DashboardMetaSelectionSaveRequest,
  DashboardLoginResponse,
  DashboardSessionResponse,
  DashboardSettingsResponse,
  DashboardSettingsUpdateRequest,
  DashboardSummaryResponse,
  DashboardWorkflowResponse
} from '../types/dashboard'

async function requestJson<T>(input: string, init?: RequestInit) {
  const hasBody = init?.body !== undefined
  const response = await fetch(input, {
    credentials: 'same-origin',
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  })

  const text = await response.text()
  let payload: T | null = null

  try {
    payload = text ? JSON.parse(text) as T : null
  } catch {
    payload = null
  }

  return { response, payload }
}

export function useDashboardApi() {
  return {
    requestJson,
    getSession: () => requestJson<DashboardSessionResponse>('/dashboard/api/session'),
    getSummary: () => requestJson<DashboardSummaryResponse>('/dashboard/api/summary'),
    getCampaignHierarchy: (limit = 50) => requestJson<DashboardCampaignHierarchyResponse>(`/dashboard/api/campaigns/hierarchy?limit=${limit}`),
    getAudiences: (params?: { limit?: number, type?: 'all' | 'custom' | 'lookalike' }) => {
      const query = new URLSearchParams()
      query.set('limit', String(params?.limit ?? 50))
      query.set('type', params?.type ?? 'all')
      return requestJson<DashboardAudienceListResponse>(`/dashboard/api/audiences?${query.toString()}`)
    },
    syncCampaignHierarchy: (limit = 50) => requestJson<DashboardCampaignSyncResponse>('/dashboard/api/campaigns/sync', {
      method: 'POST',
      body: JSON.stringify({ limit })
    }),
    getAdDetail: (adId: string) => requestJson<DashboardAdDetailResponse>(`/dashboard/api/ads/${adId}/detail`),
    duplicateCampaign: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/campaigns/${campaignId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    duplicateCampaignTree: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/campaigns/${campaignId}/duplicate-tree`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    deleteCampaign: (campaignId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/campaigns/${campaignId}/delete`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    duplicateAdSet: (adSetId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/adsets/${adSetId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    deleteAdSet: (adSetId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/adsets/${adSetId}/delete`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    inspectAdPromotability: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/ads/${adId}/promotability`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    preflightDuplicateAd: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/ads/${adId}/preflight/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    duplicateAd: (adId: string, body: Record<string, unknown>) => requestJson<DashboardMetaActionResponse>(`/dashboard/api/ads/${adId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    getCreativeLibrary: (params?: { limit?: number, assetType?: 'all' | 'image' | 'video' }) => {
      const query = new URLSearchParams()
      query.set('limit', String(params?.limit ?? 50))
      query.set('assetType', params?.assetType ?? 'all')
      return requestJson<DashboardCreativeLibraryResponse>(`/dashboard/api/creatives?${query.toString()}`)
    },
    getWorkflows: () => requestJson<DashboardWorkflowResponse>('/dashboard/api/workflows'),
    getSettings: () => requestJson<DashboardSettingsResponse>('/dashboard/api/settings'),
    updateSettings: (body: DashboardSettingsUpdateRequest) => requestJson<DashboardSettingsResponse>('/dashboard/api/settings', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    startMetaOAuth: () => requestJson<DashboardMetaOAuthStartResponse>('/dashboard/api/meta/oauth/start'),
    saveMetaSelections: (connectionId: string, body: DashboardMetaSelectionSaveRequest) => requestJson<DashboardMetaConnectionMutationResponse>(`/dashboard/api/meta/connections/${connectionId}/selections`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    unbindMetaConnection: (connectionId: string) => requestJson<DashboardMetaConnectionMutationResponse>(`/dashboard/api/meta/connections/${connectionId}/unbind`, {
      method: 'POST'
    }),
    removeMetaConnection: (connectionId: string) => requestJson<DashboardMetaConnectionMutationResponse>(`/dashboard/api/meta/connections/${connectionId}`, {
      method: 'DELETE'
    }),
    generateCreative: (body: DashboardCreativeGenerateRequest) => requestJson<DashboardCreativeGenerateResponse>('/dashboard/api/creatives/generate', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    deleteCreative: (assetId: string) => requestJson<DashboardCreativeDeleteResponse>(`/dashboard/api/creatives/${assetId}`, {
      method: 'DELETE'
    }),
    login: (username: string, password: string) => requestJson<DashboardLoginResponse>('/dashboard/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
    logout: () => requestJson<DashboardLoginResponse>('/dashboard/logout', {
      method: 'POST',
      body: JSON.stringify({})
    })
  }
}
