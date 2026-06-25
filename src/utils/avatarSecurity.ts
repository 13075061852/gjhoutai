const DEFAULT_URL_BASE = 'http://localhost/';
const UNSAFE_AVATAR_URL_CHARS = /["'<>`\u0000-\u001F\u007F]/;
const SAFE_AVATAR_PROTOCOLS = new Set(['blob:', 'http:', 'https:']);

export function normalizeSafeAvatarUrl(value: string | null | undefined, baseUrl = DEFAULT_URL_BASE) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || UNSAFE_AVATAR_URL_CHARS.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed, baseUrl);
    return SAFE_AVATAR_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
