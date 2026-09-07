// Only the loopback review build redirects original public media through its read-only proxy.
export function reviewMediaValue(value) {
  if (typeof __RECORDS_PREVIEW__ === 'undefined' || !__RECORDS_PREVIEW__ || !['localhost','127.0.0.1','::1'].includes(globalThis.location?.hostname)) return value;
  return typeof value === 'string' ? value.replace(/https?:\/\/(?:www\.)?coldwaterkim\.com(?=\/api\/files\/)/g, location.origin) : value;
}
