interface MetaVideoBindingRecord {
  accountId: string;
  metaVideoId: string;
  status: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  durationSeconds: number | null;
  uploadedAt: string;
  lastSyncedAt: string;
  uploadSessionId: string | null;
  publishSource: 'meta-advideos';
}

interface AssetMetadataWithMetaBindings extends Record<string, unknown> {
  metaAds?: {
    videoBindings?: Record<string, MetaVideoBindingRecord>;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface StoredMetaVideoBinding {
  accountId: string;
  metaVideoId: string;
  status: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  durationSeconds: number | null;
  uploadedAt: string;
  lastSyncedAt: string;
  uploadSessionId: string | null;
  publishSource: 'meta-advideos';
}

export function getMetaVideoBindingForAccount(metadata: unknown, accountId?: string | null): StoredMetaVideoBinding | null {
  if (!accountId) {
    return null;
  }

  const root = asRecord(metadata) as AssetMetadataWithMetaBindings | null;
  const binding = asRecord(root?.metaAds?.videoBindings?.[accountId]);
  if (!binding) {
    return null;
  }

  const metaVideoId = asString(binding.metaVideoId);
  const uploadedAt = asString(binding.uploadedAt);
  const lastSyncedAt = asString(binding.lastSyncedAt);

  if (!metaVideoId || !uploadedAt || !lastSyncedAt) {
    return null;
  }

  return {
    accountId: asString(binding.accountId) ?? accountId,
    metaVideoId,
    status: asString(binding.status),
    title: asString(binding.title),
    thumbnailUrl: asString(binding.thumbnailUrl),
    sourceUrl: asString(binding.sourceUrl),
    durationSeconds: asNumber(binding.durationSeconds),
    uploadedAt,
    lastSyncedAt,
    uploadSessionId: asString(binding.uploadSessionId),
    publishSource: 'meta-advideos'
  };
}

export function mergeMetaVideoBinding(metadata: unknown, binding: StoredMetaVideoBinding) {
  const root = asRecord(metadata) ?? {};
  const metaAds = asRecord(root.metaAds) ?? {};
  const videoBindings = (asRecord(metaAds.videoBindings) ?? {}) as Record<string, MetaVideoBindingRecord>;

  return {
    ...root,
    metaAds: {
      ...metaAds,
      videoBindings: {
        ...videoBindings,
        [binding.accountId]: {
          accountId: binding.accountId,
          metaVideoId: binding.metaVideoId,
          status: binding.status,
          title: binding.title,
          thumbnailUrl: binding.thumbnailUrl,
          sourceUrl: binding.sourceUrl,
          durationSeconds: binding.durationSeconds,
          uploadedAt: binding.uploadedAt,
          lastSyncedAt: binding.lastSyncedAt,
          uploadSessionId: binding.uploadSessionId,
          publishSource: binding.publishSource
        }
      }
    }
  } satisfies AssetMetadataWithMetaBindings;
}
