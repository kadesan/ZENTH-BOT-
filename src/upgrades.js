const REGION = "nae";
const SERVER = "zikel";
const KISK_BASE_URL = "https://kisk.app";
const CACHE_TTL_MS = 15 * 60 * 1000;
const USER_COOLDOWN_MS = 30 * 1000;
const MAX_QUEUE_WAIT_MS = 90 * 1000;

const cache = new Map();
const inFlight = new Map();
const userCooldowns = new Map();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spacedFetch(url) {
  const request = requestQueue.then(async () => {
    const wait = 1_500 - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetch(url, {
      headers: { Accept: "text/html", "User-Agent": "ZENTH-AION2-Discord-Bot/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
  });
  requestQueue = request.catch(() => {});
  return request;
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(html) {
  return decodeEntities(
    html
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function routeCardsFromHtml(html) {
  const cards = [];
  const liTags = /<\/?li\b[^>]*>/gi;
  let depth = 0;
  let routeStart = -1;
  let match;

  while ((match = liTags.exec(html)) !== null) {
    const isClosing = /^<\//.test(match[0]);
    if (!isClosing) {
      if (depth === 0 && /\bclass="[^"]*\broute\b/.test(match[0])) {
        routeStart = match.index;
      }
      depth += 1;
      continue;
    }

    depth = Math.max(0, depth - 1);
    if (depth === 0 && routeStart >= 0) {
      cards.push(html.slice(routeStart, liTags.lastIndex));
      routeStart = -1;
    }
  }

  return cards;
}

function parseRouteCard(html) {
  const nameMarkup = html.match(/<span class="named"[^>]*>\s*<b>([\s\S]*?)<\/b>/i)?.[1];
  if (!nameMarkup) return null;

  const gradeMarkup = html.match(/<span class="grades">([\s\S]*?)<\/span>\s*<\/span>/i)?.[1] ?? "";
  const grades = [...gradeMarkup.matchAll(
    /<span class="([a-z]+)">\s*<b class="letter">([\s\S]*?)<\/b>\s*([\d.]+(?:\s+to\s+[\d.]+)?)/gi
  )];

  const average = html.match(/<p class="note average">([\s\S]*?)<\/p>/i)?.[1];
  const stepsMarkup = html.match(/<ol class="steps">([\s\S]*?)<\/ol>/i)?.[1] ?? "";
  const steps = [...stepsMarkup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((step) => textFromHtml(step[1]))
    .filter(Boolean)
    .slice(0, 3);

  return {
    name: textFromHtml(nameMarkup),
    currentGrade: grades[0] ? `${textFromHtml(grades[0][2])} ${textFromHtml(grades[0][3])}` : null,
    targetGrade: grades[1] ? `${textFromHtml(grades[1][2])} ${textFromHtml(grades[1][3])}` : null,
    average: average ? textFromHtml(average) : null,
    steps,
  };
}

function parseCharacterData(html, characterName, url) {
  const pageName = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (!pageName) throw new Error("Kisk no encontró ese personaje en Zikel.");

  const hero = html.match(/<section class="hero">([\s\S]*?)<\/section>/i)?.[1] ?? "";
  const classPill = hero.match(/<span class="pill">\s*(Lv\s*\d+\s+[^<]+)<\/span>/i)?.[1];
  const faction = hero.match(/<span class="pill (?:asmodian|elyos)">([\s\S]*?)<\/span>/i)?.[1];
  const serverName = hero.match(/<a class="pill link" href="\/census\/[^\"]*">([\s\S]*?)<\/a>/i)?.[1];
  const legion = hero.match(/<a class="pill link" href="\/l\/[^\"]*">([\s\S]*?)<\/a>/i)?.[1];
  const combatPower = hero.match(/<span class="pill cp">([\s\S]*?)<\/span>/i)?.[1];
  const imageSource = hero.match(/<img\b[^>]*src="([^"]+)"/i)?.[1];
  let profileImageUrl = null;
  if (imageSource) {
    try {
      const imageUrl = new URL(decodeEntities(imageSource));
      if (imageUrl.protocol === "https:" && (imageUrl.hostname === "profileimg.plaync.com" || imageUrl.hostname.endsWith(".playnccdn.com"))) {
        profileImageUrl = imageUrl.href;
      }
    } catch {
      profileImageUrl = null;
    }
  }

  const cards = routeCardsFromHtml(html).map(parseRouteCard).filter(Boolean);

  return {
    characterName: textFromHtml(pageName) || characterName,
    className: classPill ? textFromHtml(classPill) : null,
    faction: faction ? textFromHtml(faction) : null,
    serverName: serverName ? textFromHtml(serverName) : null,
    legion: legion ? textFromHtml(legion) : null,
    combatPower: combatPower ? textFromHtml(combatPower) : null,
    profileImageUrl,
    cards: cards.slice(0, 5),
    url,
    fetchedAt: Date.now(),
  };
}

async function fetchReportHtml(url) {
  const deadline = Date.now() + MAX_QUEUE_WAIT_MS;

  while (true) {
    const response = await spacedFetch(url);
    const html = await response.text();

    if (response.status === 202) {
      if (Date.now() >= deadline) {
        throw new Error("Kisk tiene consultas pendientes. Inténtalo de nuevo en un momento.");
      }
      const suggestedWait = Number(response.headers.get("kisk-again")) || 5_000;
      await sleep(Math.max(1_000, Math.min(suggestedWait, 20_000)));
      continue;
    }

    if (!response.ok) {
      if (response.status === 404) throw new Error("Kisk no encontró ese personaje en Zikel.");
      throw new Error(`Kisk respondió con un error (${response.status}).`);
    }

    return html;
  }
}

export function upgradeCooldownSeconds(userId) {
  const now = Date.now();
  const lastUse = userCooldowns.get(userId) ?? 0;
  const remaining = USER_COOLDOWN_MS - (now - lastUse);
  if (remaining > 0) return Math.ceil(remaining / 1000);

  userCooldowns.set(userId, now);
  return 0;
}

async function getCharacterData(characterName) {
  const normalizedName = characterName.normalize("NFC").trim();
  if (!/^[\p{L}\p{N} .'’_-]{2,32}$/u.test(normalizedName)) throw new Error("Nombre de personaje no válido.");

  const key = normalizedName.toLocaleLowerCase("es");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  if (inFlight.has(key)) return inFlight.get(key);

  const url = `${KISK_BASE_URL}/c/${REGION}/${SERVER}/${encodeURIComponent(normalizedName)}/upgrades`;
  const request = (async () => {
    const html = await fetchReportHtml(`${KISK_BASE_URL}/api/character/${REGION}/${SERVER}/${encodeURIComponent(normalizedName)}/upgrades`);
    const characterData = parseCharacterData(html, normalizedName, url);
    cache.set(key, characterData);
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return characterData;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export async function getCharacterProfile(characterName) {
  const data = await getCharacterData(characterName);
  return {
    characterName: data.characterName,
    className: data.className,
    faction: data.faction,
    serverName: data.serverName,
    combatPower: data.combatPower,
    profileImageUrl: data.profileImageUrl,
    url: data.url,
  };
}

export async function getUpgradeReport(characterName) {
  const report = await getCharacterData(characterName);
  if (report.cards.length === 0) {
    throw new Error("Kisk todavía no tiene recomendaciones disponibles para ese personaje.");
  }
  return report;
}
