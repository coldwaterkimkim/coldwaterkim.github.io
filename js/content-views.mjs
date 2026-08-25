export const CONTENT_VIEW_KINDS = Object.freeze(['post', 'daily', 'program', 'nasajab']);

const CONTENT_VIEW_KIND_SET = new Set(CONTENT_VIEW_KINDS);

export function contentViewKey(kind, id) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const normalizedId = String(id || '').trim();
  if (!CONTENT_VIEW_KIND_SET.has(normalizedKind) || !normalizedId) return '';
  return `${normalizedKind}:${normalizedId}`.slice(0, 80);
}

export function contentViewHashSeed(kind, visitorId, id, sessionBucket) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const normalizedId = String(id || '').trim();
  const key = contentViewKey(normalizedKind, normalizedId);
  if (!key || !visitorId || !Number.isFinite(sessionBucket)) return '';
  if (normalizedKind === 'post') {
    return `cwk-post-view-v1:${visitorId}:${normalizedId}:${sessionBucket}`;
  }
  return `cwk-content-view-v1:${visitorId}:${key}:${sessionBucket}`;
}

export function isContentViewDuplicateError(error) {
  return error?.status === 400
    && error?.response?.data?.view_key?.code === 'validation_not_unique';
}

export async function recordContentViewWithAdapter(target = {}, adapter = {}) {
  const kind = String(target.kind || '').trim().toLowerCase();
  const id = String(target.id || '').trim();
  const key = contentViewKey(kind, id);
  if (adapter.loggedIn === true || !key || target.published !== true) return false;

  const sessions = adapter.sessions || {};
  const legacyPostSessionKey = kind === 'post' ? id : '';
  if (sessions[key] || (legacyPostSessionKey && sessions[legacyPostSessionKey])) return false;

  const seed = contentViewHashSeed(kind, adapter.visitorId, id, adapter.sessionBucket);
  if (!seed || typeof adapter.hash !== 'function' || typeof adapter.create !== 'function') return false;
  const viewKey = await adapter.hash(seed);
  const slug = String(target.slug || '').slice(0, 200);
  const payload = {
    view_key: viewKey,
    post_id: id,
    post_slug: slug,
    content_kind: kind,
    content_key: key,
    content_slug: slug,
    day_key: String(adapter.dayKey || '')
  };

  try {
    await adapter.create(payload, viewKey);
  } catch (error) {
    if (!isContentViewDuplicateError(error)) {
      adapter.onError?.(error);
      return false;
    }
  }

  sessions[key] = { expiresAt: Number(adapter.expiresAt) };
  adapter.saveSessions?.(sessions);
  return true;
}
