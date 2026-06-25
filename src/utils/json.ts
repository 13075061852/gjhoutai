type ParseJsonOptions = {
  warn?: boolean;
};

export const parseJsonOr = <T>(raw: string | null | undefined, fallback: T, options: ParseJsonOptions = {}): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    if (options.warn !== false) {
      console.warn('Invalid JSON payload ignored.', error);
    }
    return fallback;
  }
};

export const parseJsonMaybe = <T>(raw: string | null | undefined): T | null => {
  return parseJsonOr<T | null>(raw, null, { warn: false });
};

export const cloneJsonValue = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};
