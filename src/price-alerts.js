import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ALERTS_PATH = path.join(process.cwd(), "data", "price-alerts.json");
const MAX_ALERTS_PER_USER = 5;
let alertsPromise;
let writeQueue = Promise.resolve();

async function loadAlerts() {
  if (!alertsPromise) {
    alertsPromise = readFile(ALERTS_PATH, "utf8")
      .then((contents) => JSON.parse(contents))
      .catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
  }
  return alertsPromise;
}

async function saveAlerts(alerts) {
  await mkdir(path.dirname(ALERTS_PATH), { recursive: true });
  const temporaryPath = `${ALERTS_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(alerts, null, 2)}\n`, "utf8");
  await rename(temporaryPath, ALERTS_PATH);
  alertsPromise = Promise.resolve(alerts);
}

function serializeWrite(action) {
  const next = writeQueue.then(action);
  writeQueue = next.catch(() => {});
  return next;
}

export async function createPriceAlert({ guildId, channelId, userId, itemKey, itemName, maxPrice }) {
  return serializeWrite(async () => {
    const alerts = await loadAlerts();
    const userAlerts = alerts.filter((alert) => alert.userId === userId && alert.guildId === guildId);
    if (userAlerts.length >= MAX_ALERTS_PER_USER) {
      throw new Error(`Puedes tener hasta ${MAX_ALERTS_PER_USER} alertas activas a la vez.`);
    }
    if (userAlerts.some((alert) => String(alert.itemKey) === String(itemKey))) {
      throw new Error("Ya tienes una alerta activa para ese objeto. Puedes eliminarla con `/quitar-alerta` y crear otra.");
    }

    const alert = {
      id: randomUUID().slice(0, 8),
      guildId,
      channelId,
      userId,
      itemKey: String(itemKey),
      itemName,
      maxPrice: Math.floor(maxPrice),
      createdAt: new Date().toISOString(),
    };
    alerts.push(alert);
    await saveAlerts(alerts);
    return alert;
  });
}

export async function getUserPriceAlerts(guildId, userId) {
  const alerts = await loadAlerts();
  return alerts.filter((alert) => alert.guildId === guildId && alert.userId === userId);
}

export async function deleteUserPriceAlert(guildId, userId, alertId) {
  return serializeWrite(async () => {
    const alerts = await loadAlerts();
    const alertIndex = alerts.findIndex((alert) =>
      alert.guildId === guildId && alert.userId === userId && alert.id === alertId);
    if (alertIndex < 0) return false;
    alerts.splice(alertIndex, 1);
    await saveAlerts(alerts);
    return true;
  });
}

export async function getActivePriceAlerts() {
  return loadAlerts();
}

export async function removeTriggeredPriceAlert(alertId) {
  return serializeWrite(async () => {
    const alerts = await loadAlerts();
    const remainingAlerts = alerts.filter((alert) => alert.id !== alertId);
    if (remainingAlerts.length === alerts.length) return;
    await saveAlerts(remainingAlerts);
  });
}
