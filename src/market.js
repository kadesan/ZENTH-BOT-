const API_BASE = "https://aion2.exchange/api";
const ZIKEL_SERVER_ID = 12102;
const CACHE_TTL_MS = 30_000;
const cache = new Map();

async function cachedJson(cacheKey, url) {
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`El mercado respondió con el estado ${response.status}.`);
  const value = await response.json();
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function searchMarketItems(query) {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2) return [];

  const cacheKey = `search:${normalizedQuery.toLocaleLowerCase()}`;
  const url = new URL(`${API_BASE}/items`);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("server", String(ZIKEL_SERVER_ID));
  url.searchParams.set("limit", "25");

  const result = await cachedJson(cacheKey, url);
  return Array.isArray(result.items) ? result.items : [];
}

export async function getMarketItem(itemKey) {
  if (!/^\d+$/.test(String(itemKey))) throw new Error("Selecciona un objeto de la lista de sugerencias.");
  const url = new URL(`${API_BASE}/items/${encodeURIComponent(itemKey)}`);
  url.searchParams.set("server", String(ZIKEL_SERVER_ID));
  return cachedJson(`item:${itemKey}`, url);
}
