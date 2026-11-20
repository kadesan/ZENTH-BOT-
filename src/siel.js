const REGION = "nae";
const SERVER_ID = 2102; // Zikel, NA East
const SERVER_NAME = "Zikel";
const CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map();
const inFlight = new Map();

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
    const url = `https://siel.tools/api/players/${REGION}/${SERVER_ID}/${encodeURIComponent(name)}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "ZENTH-AION2-Bot/1.0 (Discord character card)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) throw new Error(`No encontré a **${name}** en Zikel. Revisa que el nombre esté escrito igual que en el juego.`);
    if (!response.ok) throw new Error(`Siel respondió con el estado ${response.status}. Inténtalo de nuevo más tarde.`);

    const payload = await response.json();
    const player = payload?.player;
    const snapshot = payload?.snapshot;
    if (!player || !snapshot || player.missing) {
      throw new Error(`Siel no tiene una ficha disponible para **${name}** en Zikel.`);
    }

    const profile = {
      player,
      snapshot,
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
