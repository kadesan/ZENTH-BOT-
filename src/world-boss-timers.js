import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TIMERS_PATH = path.join(process.cwd(), "data", "world-boss-timers.json");
const WARNING_LEAD_MS = 10 * 60 * 1000;
let timersPromise;
let writeQueue = Promise.resolve();

async function loadTimers() {
  if (!timersPromise) {
    timersPromise = readFile(TIMERS_PATH, "utf8")
      .then((contents) => JSON.parse(contents))
      .catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
  }
  return timersPromise;
}

async function saveTimers(timers) {
  await mkdir(path.dirname(TIMERS_PATH), { recursive: true });
  const temporaryPath = `${TIMERS_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(timers, null, 2)}\n`, "utf8");
  await rename(temporaryPath, TIMERS_PATH);
  timersPromise = Promise.resolve(timers);
}

function serializeWrite(action) {
  const next = writeQueue.then(action);
  writeQueue = next.catch(() => {});
  return next;
}

export async function setWorldBossTimer({ guildId, boss, remainingMinutes, startedAt = Date.now() }) {
  return serializeWrite(async () => {
    const timers = await loadTimers();
    const spawnAt = startedAt + remainingMinutes * 60 * 1000;
    const timer = {
      id: `${guildId}:${boss}`,
      guildId,
      boss,
      remainingMinutes,
      startedAt: new Date(startedAt).toISOString(),
      spawnAt: new Date(spawnAt).toISOString(),
      notifyAt: new Date(Math.max(startedAt, spawnAt - WARNING_LEAD_MS)).toISOString(),
      notifiedAt: null,
    };
    const index = timers.findIndex((entry) => entry.id === timer.id);
    if (index >= 0) timers[index] = timer;
    else timers.push(timer);
    await saveTimers(timers);
    return timer;
  });
}

export async function getDueWorldBossTimers(now = Date.now()) {
  const timers = await loadTimers();
  return timers.filter((timer) => !timer.notifiedAt && Date.parse(timer.notifyAt) <= now);
}

export async function markWorldBossTimerNotified(timerId, notifiedAt = Date.now()) {
  return serializeWrite(async () => {
    const timers = await loadTimers();
    const timer = timers.find((entry) => entry.id === timerId);
    if (!timer || timer.notifiedAt) return false;
    timer.notifiedAt = new Date(notifiedAt).toISOString();
    await saveTimers(timers);
    return true;
  });
}
