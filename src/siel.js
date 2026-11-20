const REGION = "nae";
const SERVER_ID = 2102; // Zikel, NA East
const CACHE_TTL_MS = 60 * 1000;
const SIEL_REFRESH_AFTER_MS = 2 * 60 * 1000;
const REFRESH_RETRY_MS = 2 * 60 * 1000;
const profileCache = new Map();
const inFlight = new Map();
const lastRefreshAttempt = new Map();

function playerUrl(name) {
  return `https://siel.tools/api/players/${REGION}/${SERVER_ID}/${encodeURIComponent(name)}`;
}

async function fetchPlayerPayload(name) {
  const response = await fetch(playerUrl(name), {
    headers: {
      accept: "application/json",
      "user-agent": "ZENTH-AION2-Bot/1.0 (Discord character card)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) throw new Error(`No encontré a **${name}** en Zikel. Revisa que el nombre esté escrito igual que en el juego.`);
  if (!response.ok) throw new Error(`Siel respondió con el estado ${response.status}. Inténtalo de nuevo más tarde.`);
  const payload = await response.json();
  if (!payload?.player || !payload?.snapshot || payload.player.missing) {
    throw new Error(`Siel no tiene una ficha disponible para **${name}** en Zikel.`);
  }
  return payload;
}

async function refreshIfStale(name, cacheKey, payload) {
  const checkedAt = Number(payload.player.checkedAt || payload.snapshot.at || 0);
  if (!checkedAt || Date.now() - checkedAt < SIEL_REFRESH_AFTER_MS) return { payload, refreshStatus: "current" };
  if (Date.now() - (lastRefreshAttempt.get(cacheKey) || 0) < REFRESH_RETRY_MS) {
    return { payload, refreshStatus: "stale" };
  }

  lastRefreshAttempt.set(cacheKey, Date.now());
  try {
    const response = await fetch(`${playerUrl(name)}/refresh`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "user-agent": "ZENTH-AION2-Bot/1.0 (Discord character card)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { payload, refreshStatus: "stale" };

    // Siel puede tardar unos segundos en actualizar el personaje después del POST.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const refreshedPayload = await fetchPlayerPayload(name);
    const refreshedAt = Number(refreshedPayload.player.checkedAt || refreshedPayload.snapshot.at || 0);
    return {
      payload: refreshedPayload,
      refreshStatus: refreshedAt > checkedAt ? "updated" : "stale",
    };
  } catch {
    return { payload, refreshStatus: "stale" };
  }
}

export async function getSielCharacterProfile(characterName) {
  const name = characterName.normalize("NFC").trim();
  if (!/^[\p{L}\p{N} .'’_-]{2,32}$/u.test(name)) {
    throw new Error("Escribe un nombre de personaje válido.");
  }

  const cacheKey = name.toLocaleLowerCase("en-US");
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.profile;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const request = (async () => {
    const initialPayload = await fetchPlayerPayload(name);
    const { payload, refreshStatus } = await refreshIfStale(name, cacheKey, initialPayload);
    const player = payload.player;
    const snapshot = payload.snapshot;

    const profile = {
      player,
      snapshot,
      refreshStatus,
      url: `https://siel.tools/${REGION}/zikel/${encodeURIComponent(player.name || name)}`,
    };
    profileCache.set(cacheKey, { fetchedAt: Date.now(), profile });
    if (profileCache.size > 100) profileCache.delete(profileCache.keys().next().value);
    return profile;
  })();
  inFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlight.delete(cacheKey);
  }
}
