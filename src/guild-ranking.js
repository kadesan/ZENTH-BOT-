const GUILD_PAGE_URL = "https://siel.tools/guild/nae/zikel/Zenth";
const REQUEST_TIMEOUT_MS = 20_000;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function textContent(html) {
  return decodeHtml(String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function captureText(source, expression) {
  const match = source.match(expression);
  return match ? textContent(match[1]) : "";
}

function firstNumber(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").match(/[-+]?\d[\d,]*/)?.[0] || "—";
}

function parseMember(block) {
  const rankText = captureText(block, /<span class="pos[^\"]*">([\s\S]*?)<\/span>/);
  const name = captureText(block, /<a class="nm[^\"]*"[^>]*>([\s\S]*?)<\/a>/);
  const className = captureText(block, /<span class="sub">([\s\S]*?)<\/span>/);
  const level = captureText(block, /<span class="v lv">([\s\S]*?)<\/span>/);
  const combatPower = firstNumber(block.match(/<span class="v cp">([\s\S]*?)<\/span>/)?.[1]);
  const itemLevel = firstNumber(block.match(/<span class="v il">([\s\S]*?)<\/span>/)?.[1]);
  const weeklyGain = firstNumber(block.match(/<span class="v gain[^\"]*">([\s\S]*?)<\/span>/)?.[1]);
  const portrait = decodeHtml(block.match(/<img class="portrait" src="([^\"]+)"/)?.[1] || "");
  const rank = Number(rankText.replace(/\D/g, ""));
  if (!name || !Number.isFinite(rank) || rank < 1) return null;
  return { rank, name, className, level, combatPower, itemLevel, weeklyGain, portrait };
}

export async function getGuildRanking() {
  const response = await fetch(`${GUILD_PAGE_URL}?refresh=${Math.floor(Date.now() / 300_000)}`, {
    headers: {
      accept: "text/html",
      "cache-control": "no-cache",
      "user-agent": "ZENTH-AION2-Bot/1.0 (Guild ranking refresh)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Siel respondió con el estado ${response.status}.`);
  const html = await response.text();
  const memberBlocks = [...html.matchAll(/<li class="rk[^\"]*">([\s\S]*?)<\/li>/g)];
  const members = memberBlocks.map((match) => parseMember(match[1])).filter(Boolean).slice(0, 120);
  if (members.length === 0) throw new Error("No pude leer los miembros de la página de Zenth en Siel.");

  const facts = html.match(/<div class="guild-facts">([\s\S]*?)<\/div>/)?.[1] || "";
  const ranksHtml = html.match(/<ul class="ranks legion-ranks">([\s\S]*?)<\/ul>/)?.[1] || "";
  const rankLines = [...ranksHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => textContent(match[1]));
  const pageTitle = captureText(html, /<h1 class="atreia">([\s\S]*?)<\/h1>/) || "Zenth";
  const ogImage = decodeHtml(html.match(/property="og:image" content="([^\"]+)"/)?.[1] || "");
  return {
    name: pageTitle,
    url: GUILD_PAGE_URL,
    ogImage,
    memberCount: Number(captureText(facts, /<span>([\d,]+) members seen<\/span>/).replace(/,/g, "")) || members.length,
    averageCp: captureText(facts, /Average CP<!-- -->\s*<b class="cp">([\s\S]*?)<\/b>/),
    totalPower: captureText(facts, /Power<!-- -->\s*<b class="cp">([\s\S]*?)<\/b>/),
    faction: captureText(facts, /<span>(Asmodian|Elyos)<\/span>/),
    strongest: captureText(facts, /Strongest<!-- -->\s*<b>([\s\S]*?)<\/b>/),
    rankServer: Number(rankLines.find((line) => line.includes("on Zikel"))?.match(/#\s*([\d,]+)/)?.[1]?.replace(/,/g, "")) || null,
    rankRegion: Number(rankLines.find((line) => line.includes("in North America East"))?.match(/#\s*([\d,]+)/)?.[1]?.replace(/,/g, "")) || null,
    members,
    fetchedAt: Date.now(),
  };
}
