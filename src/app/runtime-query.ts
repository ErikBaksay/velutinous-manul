const RUNTIME_QUERY_KEYS = ['debug', 'metrics', 'quality'] as const;
const INITIAL_RUNTIME_QUERY_PARAMS = readRuntimeQueryParams(
  typeof window === 'undefined' ? '' : window.location.search,
);

export type RuntimeQueryParams = Partial<Record<(typeof RUNTIME_QUERY_KEYS)[number], string>>;

export function getRuntimeQueryParams(): RuntimeQueryParams {
  if (typeof window === 'undefined') {
    return {};
  }

  const params = new URLSearchParams();
  for (const key of RUNTIME_QUERY_KEYS) {
    const value = INITIAL_RUNTIME_QUERY_PARAMS[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const currentParams = new URLSearchParams(window.location.search);
  for (const key of RUNTIME_QUERY_KEYS) {
    const value = currentParams.get(key);
    if (value !== null) {
      params.set(key, value);
    }
  }
  const hashQueryStart = window.location.hash.indexOf('?');
  if (hashQueryStart >= 0) {
    const hashParams = new URLSearchParams(window.location.hash.slice(hashQueryStart + 1));
    for (const key of RUNTIME_QUERY_KEYS) {
      if (!params.has(key)) {
        const value = hashParams.get(key);
        if (value !== null) {
          params.set(key, value);
        }
      }
    }
  }

  const result: RuntimeQueryParams = {};
  for (const key of RUNTIME_QUERY_KEYS) {
    const value = params.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

function readRuntimeQueryParams(search: string): RuntimeQueryParams {
  const params = new URLSearchParams(search);
  const result: RuntimeQueryParams = {};
  for (const key of RUNTIME_QUERY_KEYS) {
    const value = params.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

export function getRuntimeQueryParam(key: (typeof RUNTIME_QUERY_KEYS)[number]): string | null {
  return getRuntimeQueryParams()[key] ?? null;
}
