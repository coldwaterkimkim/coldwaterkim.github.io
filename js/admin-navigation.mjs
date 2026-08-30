const ADMIN_NEXT_FALLBACK = '/';
const FORBIDDEN_CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

function safelyDecode(value) {
  let decoded = value;

  for (let index = 0; index < 5; index += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }

    if (next === decoded) return decoded;
    decoded = next;
  }

  return decoded;
}

export function normalizeAdminNext(rawNext, origin) {
  if (typeof rawNext !== 'string' || typeof origin !== 'string') {
    return ADMIN_NEXT_FALLBACK;
  }

  if (!rawNext || rawNext !== rawNext.trim()) {
    return ADMIN_NEXT_FALLBACK;
  }

  // Accept only a root-relative path. This excludes absolute URLs, credentials,
  // protocol-relative URLs, and executable URL schemes before URL parsing.
  if (!rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return ADMIN_NEXT_FALLBACK;
  }

  const decoded = safelyDecode(rawNext);
  if (!decoded || decoded.startsWith('//') || FORBIDDEN_CONTROL_OR_BACKSLASH.test(decoded)) {
    return ADMIN_NEXT_FALLBACK;
  }

  try {
    const expectedOrigin = new URL(origin).origin;
    const target = new URL(rawNext, expectedOrigin);
    if (target.origin !== expectedOrigin || target.username || target.password) {
      return ADMIN_NEXT_FALLBACK;
    }

    const normalized = `${target.pathname}${target.search}${target.hash}`;
    if (target.pathname.startsWith('//') || FORBIDDEN_CONTROL_OR_BACKSLASH.test(normalized)) {
      return ADMIN_NEXT_FALLBACK;
    }

    return normalized;
  } catch {
    return ADMIN_NEXT_FALLBACK;
  }
}
