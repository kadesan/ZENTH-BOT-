import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const GROUPS_PATH = path.join(MODULE_DIR, "..", "data", "pve-groups.json");
let groupsPromise;
let writeQueue = Promise.resolve();

async function loadGroups() {
  if (!groupsPromise) {
    groupsPromise = readFile(GROUPS_PATH, "utf8")
      .then((contents) => JSON.parse(contents))
      .catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
  }
  return groupsPromise;
}

async function saveGroups(groups) {
  await mkdir(path.dirname(GROUPS_PATH), { recursive: true });
  const temporaryPath = `${GROUPS_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(groups, null, 2)}\n`, "utf8");
  await rename(temporaryPath, GROUPS_PATH);
  groupsPromise = Promise.resolve(groups);
}

function serializeWrite(action) {
  const next = writeQueue.then(action);
  writeQueue = next.catch(() => {});
  return next;
}

export async function getPveGroups() {
  return loadGroups();
}

export async function createPveGroup(data) {
  return serializeWrite(async () => {
    const groups = [...await loadGroups()];
    const group = { id: randomUUID().slice(0, 8), ...data };
    groups.push(group);
    await saveGroups(groups);
    return group;
  });
}

export async function updatePveGroup(groupId, updater) {
  return serializeWrite(async () => {
    const groups = [...await loadGroups()];
    const index = groups.findIndex((group) => group.id === groupId);
    if (index < 0) return null;
    const updated = updater({ ...groups[index], participants: [...groups[index].participants] });
    if (!updated) return null;
    groups[index] = updated;
    await saveGroups(groups);
    return updated;
  });
}

export async function removePveGroup(groupId) {
  return serializeWrite(async () => {
    const groups = [...await loadGroups()];
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return null;
    await saveGroups(groups.filter((entry) => entry.id !== groupId));
    return group;
  });
}
