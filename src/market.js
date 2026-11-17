const API_BASE = "https://aion2.exchange/api";
const ZIKEL_SERVER_ID = 12102;
const CACHE_TTL_MS = 30_000;
const SEARCH_STALE_TTL_MS = 15 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 2_500;
const ITEM_TIMEOUT_MS = 8_000;
const OUTAGE_COOLDOWN_MS = 20_000;
const cache = new Map();
const inFlight = new Map();
const unavailableUntil = new Map();

async function cachedJson(cacheKey, url, { timeoutMs = ITEM_TIMEOUT_MS, staleTtlMs = 0 } = {}) {
  const endpoint = cacheKey.startsWith("search:") ? "search" : "item";
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  if ((unavailableUntil.get(endpoint) || 0) > Date.now()) {
    if (staleTtlMs > 0 && cached && cached.staleUntil > Date.now()) return cached.value;
    throw new Error("aion2.exchange está temporalmente indisponible.");
  }

  const request = (async () => {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: "application/json",
          "User-Agent": "ZENTH-AION2-Discord-Bot/1.0",
        },
      });
      if (!response.ok) {
        if (response.status >= 500) unavailableUntil.set(endpoint, Date.now() + OUTAGE_COOLDOWN_MS);
        throw new Error(`aion2.exchange respondió con el estado ${response.status}.`);
      }
      const value = await response.json();
      const savedAt = Date.now();
      cache.set(cacheKey, {
        value,
        expiresAt: savedAt + CACHE_TTL_MS,
        staleUntil: savedAt + staleTtlMs,
      });
      return value;
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        unavailableUntil.set(endpoint, Date.now() + OUTAGE_COOLDOWN_MS);
      }
      if (staleTtlMs > 0 && cached && cached.staleUntil > Date.now()) return cached.value;
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw new Error(`aion2.exchange tardó más de ${timeoutMs} ms en responder.`);
      }
      throw error;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}

function cachedSearchFallback(query) {
  const normalizedQuery = query.toLocaleLowerCase();
  const matches = new Map();
  for (const [key, entry] of cache) {
    if (!key.startsWith("search:") || entry.staleUntil <= Date.now()) continue;
    for (const item of entry.value?.items || []) {
      const itemKey = String(item?.item_key ?? "");
      if (itemKey && item.name?.toLocaleLowerCase().includes(normalizedQuery)) matches.set(itemKey, item);
    }
  }
  return [...matches.values()].slice(0, 25);
}

function cachedPrefixSuggestions(query) {
  const normalizedQuery = query.toLocaleLowerCase();
  let bestPrefixLength = 0;
  let bestMatches = [];

  for (const [key, entry] of cache) {
    if (!key.startsWith("search:") || entry.staleUntil <= Date.now()) continue;
    const cachedQuery = key.slice("search:".length);
    if (cachedQuery.length >= normalizedQuery.length || !normalizedQuery.startsWith(cachedQuery)) continue;

    const matches = (entry.value?.items || [])
      .filter((item) => item?.name?.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 25);
    if (matches.length && cachedQuery.length > bestPrefixLength) {
      bestPrefixLength = cachedQuery.length;
      bestMatches = matches;
    }
  }

  return bestMatches;
}

function inFlightPrefixSearch(query) {
  const normalizedQuery = query.toLocaleLowerCase();
  let bestPrefixLength = 0;
  let bestRequest = null;

  for (const [key, promise] of inFlight) {
    if (!key.startsWith("search:")) continue;
    const pendingQuery = key.slice("search:".length);
    if (pendingQuery.length >= normalizedQuery.length || !normalizedQuery.startsWith(pendingQuery)) continue;
    if (pendingQuery.length > bestPrefixLength) {
      bestPrefixLength = pendingQuery.length;
      bestRequest = promise;
    }
  }

  return bestRequest;
}

function filterSearchResults(result, query) {
  const normalizedQuery = query.toLocaleLowerCase();
  return (Array.isArray(result?.items) ? result.items : [])
    .filter((item) => item?.name?.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, 25);
}

function cachedSearchItemFallback(itemKey) {
  const key = String(itemKey);
  for (const [cacheKey, entry] of cache) {
    if (!cacheKey.startsWith("search:") || entry.staleUntil <= Date.now()) continue;
    const item = entry.value?.items?.find((candidate) => String(candidate?.item_key) === key);
    if (item && Number(item.price) > 0) return { ...item, _fromSearchCache: true };
  }
  return null;
}

export async function searchMarketItems(query, { timeoutMs = SEARCH_TIMEOUT_MS } = {}) {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2) return [];
  const deadline = Date.now() + timeoutMs;

  // Discord requests autocomplete again for each typed character. Reuse a recent
  // broader result for longer prefixes instead of hitting the market on every keystroke.
  const prefixSuggestions = cachedPrefixSuggestions(normalizedQuery);
  if (prefixSuggestions.length) return prefixSuggestions;

  // If Discord asked for a longer prefix while a shorter search is still running,
  // share that request instead of creating more simultaneous market queries.
  const pendingPrefix = inFlightPrefixSearch(normalizedQuery);
  if (pendingPrefix) {
    try {
      const result = await pendingPrefix;
      const matches = filterSearchResults(result, normalizedQuery);
      if (matches.length) return matches;
    } catch {
      return cachedSearchFallback(normalizedQuery);
    }
    const remainingTimeoutMs = deadline - Date.now();
    if (remainingTimeoutMs < 250) return cachedSearchFallback(normalizedQuery);
    timeoutMs = remainingTimeoutMs;
  }

  const cacheKey = `search:${normalizedQuery.toLocaleLowerCase()}`;
  const url = new URL(`${API_BASE}/items`);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("server", String(ZIKEL_SERVER_ID));
  url.searchParams.set("limit", "25");

  try {
    const result = await cachedJson(cacheKey, url, { timeoutMs, staleTtlMs: SEARCH_STALE_TTL_MS });
    return Array.isArray(result.items) ? result.items : [];
  } catch (error) {
    const fallback = cachedSearchFallback(normalizedQuery);
    if (fallback.length) return fallback;
    throw error;
  }
}

export async function getMarketItem(itemKey, { allowSearchFallback = false } = {}) {
  if (!/^\d+$/.test(String(itemKey))) throw new Error("Selecciona un objeto de la lista de sugerencias.");
  const url = new URL(`${API_BASE}/items/${encodeURIComponent(itemKey)}`);
  url.searchParams.set("server", String(ZIKEL_SERVER_ID));
  try {
    return { ...(await cachedJson(`item:${itemKey}`, url)), _source: "aion2.exchange" };
  } catch (error) {
    const fallback = allowSearchFallback ? cachedSearchItemFallback(itemKey) : null;
    if (fallback) return { ...fallback, _source: "aion2.exchange (dato en caché)" };
    throw error;
  }
}
