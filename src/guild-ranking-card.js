import sharp from "sharp";
import { readFile } from "node:fs/promises";

const WIDTH = 1840;
const HEIGHT = 1570;
const COLUMN_COUNT = 4;
const COLUMN_WIDTH = 434;
const COLUMN_GAP = 14;
const FIRST_COLUMN_X = 30;
const HEADER_Y = 198;
const ROWS_Y = 240;
const ROW_HEIGHT = 42;
const MEMBERS_PER_COLUMN = 30;
const avatarCache = new Map();

function escapeXml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function text(x, y, value, size = 16, fill = "#f6f0f1", weight = 500, extra = "") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" ${extra}>${escapeXml(value)}</text>`;
}

function shortName(value, max = 18) {
  const name = String(value || "—");
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

async function fetchAvatar(url) {
  if (!url || !url.startsWith("https://profileimg.plaync.com/")) return "";
  if (avatarCache.has(url)) return avatarCache.get(url) || "";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("Avatar unavailable");
    const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Unsupported avatar image");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 400_000) throw new Error("Avatar too large");
    const thumbnail = await sharp(bytes).resize(64, 64, { fit: "cover" }).jpeg({ quality: 74 }).toBuffer();
    const data = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
    avatarCache.set(url, data);
    return data;
  } catch {
    avatarCache.set(url, "");
    return "";
  }
}

async function loadAvatars(members) {
  const urls = [...new Set(members.map((member) => member.portrait).filter((url) => url && !avatarCache.has(url)))];
  for (let start = 0; start < urls.length; start += 10) {
    await Promise.all(urls.slice(start, start + 10).map(fetchAvatar));
  }
  return new Map(members.map((member) => [member.portrait, avatarCache.get(member.portrait) || ""]));
}

function buildRankingSvg(ranking, avatars, logoData) {
  const members = ranking.members.slice(0, COLUMN_COUNT * MEMBERS_PER_COLUMN);
  const defs = [];
  const columns = [];

  for (let column = 0; column < COLUMN_COUNT; column += 1) {
    const x = FIRST_COLUMN_X + column * (COLUMN_WIDTH + COLUMN_GAP);
    const firstRank = column * MEMBERS_PER_COLUMN + 1;
    const columnMembers = members.slice(column * MEMBERS_PER_COLUMN, (column + 1) * MEMBERS_PER_COLUMN);
    const lastRank = column * MEMBERS_PER_COLUMN + columnMembers.length;
    let rows = "";

    for (let index = 0; index < columnMembers.length; index += 1) {
      const member = columnMembers[index];
      const y = ROWS_Y + index * ROW_HEIGHT;
      const rankFill = member.rank === 1 ? "#ffd77c" : member.rank === 2 ? "#dce0e7" : member.rank === 3 ? "#d89b72" : "#8791a3";
      const avatarX = x + 42;
      const avatarY = y + 5;
      const avatarId = `avatar-${member.rank}`;
      const avatarData = avatars.get(member.portrait) || "";
      defs.push(`<clipPath id="${avatarId}"><circle cx="${avatarX + 16}" cy="${avatarY + 16}" r="15"/></clipPath>`);

      const portrait = avatarData
        ? `<image href="${avatarData}" x="${avatarX}" y="${avatarY}" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#${avatarId})"/>`
        : `<circle cx="${avatarX + 16}" cy="${avatarY + 16}" r="15" fill="#302126" stroke="#7e3b44"/><text x="${avatarX + 16}" y="${avatarY + 21}" text-anchor="middle" fill="#ffd6d8" font-family="Arial" font-size="15" font-weight="700">${escapeXml((member.name || "Z").slice(0, 1).toUpperCase())}</text>`;

      const gainValue = Number(String(member.weeklyGain).replace(/[+,]/g, "")) || 0;
      const gainFill = gainValue > 0 ? "#72dba2" : gainValue < 0 ? "#ff7779" : "#9aa1ad";
      const cp = member.combatPower === "—" ? "—" : member.combatPower;
      const itemLevel = member.itemLevel === "—" ? "—" : member.itemLevel;

      rows += `<rect x="${x + 1}" y="${y}" width="${COLUMN_WIDTH - 2}" height="${ROW_HEIGHT}" fill="${index % 2 === 0 ? "#15171f" : "#11131a"}"/>
        <path d="M${x + 1} ${y + ROW_HEIGHT}H${x + COLUMN_WIDTH - 1}" stroke="#2b2e39" stroke-width="1"/>
        ${text(x + 11, y + 25, member.rank, 16, rankFill, member.rank <= 3 ? 700 : 600, 'text-anchor="middle"')}
        ${portrait}
        ${text(x + 83, y + 19, shortName(member.name), 15, "#f5f2f4", 700)}
        ${text(x + 83, y + 34, shortName(member.className, 15), 11, "#9da3b0", 500)}
        ${text(x + 291, y + 26, member.level || "—", 14, "#e6e3e8", 600, 'text-anchor="middle"')}
        ${text(x + 374, y + 18, cp, 15, "#e8f2fa", 700, 'text-anchor="end"')}
        ${text(x + 374, y + 34, member.weeklyGain || "", 10, gainFill, 600, 'text-anchor="end"')}
        ${text(x + 424, y + 26, itemLevel, 13, "#c6cbd2", 600, 'text-anchor="end"')}`;
    }

    columns.push(`<rect x="${x}" y="${HEADER_Y}" width="${COLUMN_WIDTH}" height="${ROWS_Y + columnMembers.length * ROW_HEIGHT - HEADER_Y}" rx="8" fill="#11131a" stroke="#47272e" stroke-width="1.5"/>
      <path d="M${x + 1} ${HEADER_Y + 38}H${x + COLUMN_WIDTH - 1}" stroke="#7f3039" stroke-width="1.5"/>
      ${text(x + 18, HEADER_Y + 25, `${String(firstRank).padStart(2, "0")} — ${String(lastRank).padStart(2, "0")}`, 14, "#ffb3b5", 700)}
      ${text(x + 291, HEADER_Y + 25, "LV", 11, "#8e95a4", 700, 'text-anchor="middle"')}
      ${text(x + 374, HEADER_Y + 25, "CP", 11, "#8e95a4", 700, 'text-anchor="end"')}
      ${text(x + 424, HEADER_Y + 25, "IL", 11, "#8e95a4", 700, 'text-anchor="end"')}${rows}`);
  }

  const updateTime = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ranking.fetchedAt));
  const totalShown = members.length;
  const memberText = `${totalShown} de ${ranking.memberCount} personajes vistos por Siel`;
  const regionRankText = ranking.rankRegion ? `#${ranking.rankRegion} NA EAST` : "NA EAST";
  const serverRankText = ranking.rankServer ? `#${ranking.rankServer} ZIKEL` : "ZIKEL";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#160b0e"/><stop offset=".55" stop-color="#0c1018"/><stop offset="1" stop-color="#090c13"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#8e1826"/><stop offset=".5" stop-color="#f34950"/><stop offset="1" stop-color="#98232d"/></linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff2f3"/><stop offset="1" stop-color="#ff8b8f"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#f32436" flood-opacity=".55"/></filter>
    ${defs.join("")}
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <path d="M0 0H${WIDTH}V6H0ZM0 ${HEIGHT - 6}H${WIDTH}V${HEIGHT}H0Z" fill="url(#accent)"/>
  <path d="M0 175 430 0h270L0 290ZM${WIDTH} 1160l-420 410h-260l680-650Z" fill="#c81f2e" opacity=".04"/>
  <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" rx="20" fill="none" stroke="#652630" stroke-width="2"/>
  <image href="data:image/png;base64,${logoData}" x="48" y="35" width="62" height="83" preserveAspectRatio="xMidYMid meet" filter="url(#glow)"/>
  ${text(132, 72, "RANKING DE ZENTH", 39, "url(#title)", 700, 'letter-spacing="1.8"')}
  ${text(135, 107, "AION 2  ·  NA EAST / ZIKEL  ·  ORDENADO POR CP", 17, "#b5bbc8", 600, 'letter-spacing="1.1"')}
  ${text(132, 145, `${regionRankText}     ·     ${serverRankText}     ·     ${memberText}`, 17, "#f2d8da", 600)}
  ${text(1794, 68, `CP PROMEDIO  ${ranking.averageCp || "—"}`, 15, "#ffb8bb", 700, 'text-anchor="end"')}
  ${text(1794, 99, `PODER  ${ranking.totalPower || "—"}`, 15, "#d5d9e2", 600, 'text-anchor="end"')}
  ${text(1794, 130, `FACCION  ${ranking.faction || "—"}`, 13, "#9fa8b6", 600, 'text-anchor="end"')}
  <path d="M36 176H1804" stroke="#6b2a34" stroke-width="1.5"/>
  ${columns.join("")}
  ${text(38, 1540, `SIEL · Ranking consultado ${updateTime} · Datos de miembros detectados por Siel`, 13, "#9299a6", 500)}
  ${text(1802, 1540, "ZENTH", 13, "#ffb8bb", 700, 'text-anchor="end" letter-spacing="2"')}
</svg>`;
}

export async function renderGuildRankingCard(ranking) {
  const [avatars, logo] = await Promise.all([
    loadAvatars(ranking.members),
    readFile(new URL("../assets/zenth-shield.png", import.meta.url)),
  ]);
  const svg = buildRankingSvg(ranking, avatars, logo.toString("base64"));
  return sharp(Buffer.from(svg)).jpeg({ quality: 89, mozjpeg: true }).toBuffer();
}
