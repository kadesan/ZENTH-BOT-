import sharp from "sharp";
import { readFile } from "node:fs/promises";

const ATTRIBUTE_STATS = [
  ["Might", "STR"],
  ["Dexterity", "AGI"],
  ["Precision", "DEX"],
  ["Constitution", "CON"],
  ["Intelligence", "INT"],
  ["Willpower", "WIS"],
];

const DIVINE_STATS = [
  ["Nezekan", "Justice"],
  ["Zikel", "Destruction"],
  ["Vaizel", "Freedom"],
  ["Triniel", "Death"],
  ["Ariel", "Destiny"],
  ["Azphel", "Wisdom"],
  ["Kaisinel", "Illusion"],
  ["Yustiel", "Life"],
  ["Siel", "Time"],
  ["Israphel", "Space"],
];

const DAEVANION_BOARDS = [
  [21, "Nezekan"],
  [22, "Zikel"],
  [23, "Vaizel"],
  [24, "Triniel"],
  [25, "Ariel"],
  [26, "Azphel"],
];

function escapeXml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("es-CO").format(number) : "—";
}

function clampRatio(value, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric / max)) : 0;
}

function text(x, y, value, size = 18, fill = "#f4efff", weight = 500, extra = "") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" ${extra}>${escapeXml(value)}</text>`;
}

async function fetchPortraitData(portraitUrl) {
  if (typeof portraitUrl !== "string" || !portraitUrl.startsWith("https://profileimg.plaync.com/")) return "";
  try {
    const response = await fetch(portraitUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return "";
    const type = response.headers.get("content-type") || "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type.split(";")[0].toLowerCase())) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000) return "";
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

function buildCardSvg(profile, portraitData, logoData) {
  const { player, snapshot } = profile;
  const stats = snapshot.stats || {};
  const daevanion = new Map((snapshot.daevanion || []).map((board) => [Number(board.id), board]));
  const portrait = portraitData
    ? `<image href="${portraitData}" x="986" y="76" width="154" height="154" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>`
    : `<circle cx="1063" cy="153" r="65" fill="#362746"/><text x="1063" y="170" text-anchor="middle" fill="#e8d9ff" font-family="Arial" font-size="54" font-weight="700">${escapeXml((player.name || "Z").slice(0, 1).toUpperCase())}</text>`;

  const attributeRows = ATTRIBUTE_STATS.map(([label, key], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 76 + column * 238;
    const y = 421 + row * 38;
    const value = Number(stats[key] || 0);
    const barWidth = Math.round(124 * clampRatio(value, 200));
    return `${text(x, y, label.toUpperCase(), 12, "#a9a0bf", 700)}${text(x + 200, y, formatNumber(value), 14, "#fbf8ff", 700, 'text-anchor="end"')}<rect x="${x}" y="${y + 9}" width="200" height="5" rx="2.5" fill="#342b42"/><rect x="${x}" y="${y + 9}" width="${barWidth}" height="5" rx="2.5" fill="url(#bar)"/>`;
  }).join("");

  const divineRows = DIVINE_STATS.map(([label, key], index) => {
    const column = Math.floor(index / 5);
    const row = index % 5;
    const x = 626 + column * 258;
    const y = 421 + row * 25;
    const value = Number(stats[key] || 0);
    const barWidth = Math.round(93 * clampRatio(value, 100));
    return `${text(x, y, label, 12, "#d9d1e7", 600)}<rect x="${x + 77}" y="${y - 8}" width="94" height="7" rx="3.5" fill="#342b42"/><rect x="${x + 77}" y="${y - 8}" width="${barWidth}" height="7" rx="3.5" fill="url(#bar)"/>${text(x + 244, y, `${formatNumber(value)}%`, 12, "#f5edff", 700, 'text-anchor="end"')}`;
  }).join("");

  const daevaRows = DAEVANION_BOARDS.map(([id, label], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 78 + column * 357;
    const y = 600 + row * 30;
    const board = daevanion.get(id);
    const open = Number(board?.open || 0);
    const total = Number(board?.total || 0);
    const ratio = total > 0 ? Math.max(0, Math.min(1, open / total)) : 0;
    const barWidth = Math.round(198 * ratio);
    const percent = total > 0 ? `${Math.round(ratio * 100)}%` : "—";
    return `${text(x, y, label, 12, "#d9d1e7", 600)}<rect x="${x + 92}" y="${y - 8}" width="200" height="7" rx="3.5" fill="#342b42"/><rect x="${x + 92}" y="${y - 8}" width="${barWidth}" height="7" rx="3.5" fill="url(#bar)"/>${text(x + 320, y, `${open}/${total} · ${percent}`, 11, "#eee8f8", 600, 'text-anchor="end"')}`;
  }).join("");

  const checkedAt = player.checkedAt || snapshot.at;
  const snapshotDate = checkedAt ? new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(checkedAt)) : "sin fecha";
  const refreshLabel = profile.refreshStatus === "updated"
    ? "actualizado ahora"
    : profile.refreshStatus === "stale"
      ? "Siel no pudo actualizar"
      : "Siel al día";
  const guild = player.guild || snapshot.guild || "Sin legión";
  const title = player.title || "";
  const grade = player.titleGrade ? ` · ${player.titleGrade}` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10090c"/><stop offset="0.55" stop-color="#241014"/><stop offset="1" stop-color="#100a0d"/></linearGradient>
    <linearGradient id="bar" x1="0" x2="1"><stop stop-color="#e62432"/><stop offset="1" stop-color="#ff8175"/></linearGradient>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff636c"/><stop offset="0.5" stop-color="#8f202a"/><stop offset="1" stop-color="#e9aaa1"/></linearGradient>
    <clipPath id="portraitClip"><rect x="986" y="76" width="154" height="154" rx="22"/></clipPath>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity=".4"/></filter>
    <filter id="logoGlow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ff1e2d" flood-opacity=".55"/></filter>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <path d="M0 100 320 0h280L0 190ZM1200 470 900 675H700l500-310Z" fill="#a71c2a" opacity=".055"/>
  <path d="M22 80V22h80M1098 22h80v58M22 595v58h80M1098 653h80v-58" fill="none" stroke="url(#border)" stroke-width="2" opacity=".85"/>
  <rect x="25" y="25" width="1150" height="625" rx="22" fill="none" stroke="url(#border)" stroke-width="2" opacity=".74"/>
  <path d="M48 76H1152" stroke="#6f333b" stroke-width="1" opacity=".9"/>
  <image href="data:image/png;base64,${logoData}" x="52" y="27" width="42" height="55" preserveAspectRatio="xMidYMid meet" filter="url(#logoGlow)"/>
  ${text(112, 57, "ZENTH AION 2  ·  FICHA DE PERSONAJE", 19, "#ffd1d3", 700, 'letter-spacing="2"')}
  ${text(1140, 57, "NA EAST  /  ZIKEL", 13, "#c8b7b8", 700, 'text-anchor="end" letter-spacing="1.5"')}
  ${text(62, 137, player.name || snapshot.name, 48, "#fff7ff", 700)}
  ${text(64, 174, `Nv. ${player.level ?? snapshot.level ?? "—"}  ·  ${player.className || snapshot.className || "Clase sin datos"}`, 18, "#e4d9ef", 600)}
  ${text(64, 204, `${player.raceId === 2 || snapshot.raceId === 2 ? "Asmodians" : "Elyos"}  ·  ${guild}`, 14, "#afa4bf", 500)}
  ${text(64, 226, title ? `Título: ${title}${grade}` : "", 12, "#a99bb8", 500)}
  <rect x="978" y="68" width="170" height="170" rx="28" fill="#171020" stroke="url(#border)" stroke-width="2" filter="url(#shadow)"/>
  ${portrait}
  <rect x="986" y="76" width="154" height="154" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".2"/>
  <rect x="54" y="252" width="350" height="74" rx="14" fill="#26181d" stroke="#71343b"/>
  <rect x="425" y="252" width="350" height="74" rx="14" fill="#26181d" stroke="#71343b"/>
  <rect x="796" y="252" width="350" height="74" rx="14" fill="#26181d" stroke="#71343b"/>
  ${text(76, 278, "PODER DE COMBATE", 12, "#ccb8bb", 700, 'letter-spacing="1.2"')}
  ${text(76, 310, formatNumber(player.combatPower ?? snapshot.combatPower), 26, "#fff7ff", 700)}
  ${text(447, 278, "NIVEL DE OBJETO", 12, "#ccb8bb", 700, 'letter-spacing="1.2"')}
  ${text(447, 310, formatNumber(player.itemLevel ?? snapshot.itemLevel), 26, "#fff7ff", 700)}
  ${text(818, 278, "PROGRESO · 7 DÍAS", 12, "#ccb8bb", 700, 'letter-spacing="1.2"')}
  ${text(818, 310, `+${formatNumber(player.gain7d || 0)} CP`, 26, "#fff7ff", 700)}
  <rect x="54" y="344" width="520" height="195" rx="14" fill="#181215" stroke="#573239"/>
  <rect x="594" y="344" width="552" height="195" rx="14" fill="#181215" stroke="#573239"/>
  ${text(76, 377, "ATRIBUTOS", 15, "#ffd0d3", 700, 'letter-spacing="1.5"')}
  ${text(616, 377, "ESTADÍSTICAS DIVINAS", 15, "#ffd0d3", 700, 'letter-spacing="1.5"')}
  ${attributeRows}
  ${divineRows}
  <rect x="54" y="552" width="1092" height="88" rx="14" fill="#181215" stroke="#573239"/>
  ${text(76, 580, "DAEVANION", 14, "#ffd0d3", 700, 'letter-spacing="1.5"')}
  ${daevaRows}
  ${text(60, 665, `Fuente: Siel · ${refreshLabel} · Consultado ${snapshotDate} UTC`, 11, "#b19fa2", 500)}
  ${text(1140, 665, "ZENTH", 11, "#ffb7bc", 700, 'text-anchor="end" letter-spacing="2"')}
</svg>`;
}

export async function renderProfileCard(profile) {
  const [portraitData, logo] = await Promise.all([
    fetchPortraitData(profile.player.portrait),
    readFile(new URL("../assets/zenth-shield.png", import.meta.url)),
  ]);
  const svg = buildCardSvg(profile, portraitData, logo.toString("base64"));
  return sharp(Buffer.from(svg)).png().toBuffer();
}
