/** Retired search settings must not survive imports, cloud sync, or exports. */
export function withoutRetiredSearchConfig<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const next = { ...value } as Record<string, unknown>;
  for (const key of ['searchProvider', 'searchApiKey', 'searchDepth', 'searchMaxResults', 'searchTopic']) delete next[key];
  return next as T;
}
