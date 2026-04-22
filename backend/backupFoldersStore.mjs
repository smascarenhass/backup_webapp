import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = path.resolve(process.cwd(), "data");
const dataFilePath = path.join(dataDir, "backup-folders.json");

function normalizeFolderPath(folderPath) {
  return String(folderPath ?? "").trim();
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFilePath, "utf-8");
  } catch {
    await writeFile(
      dataFilePath,
      JSON.stringify({ folders: [] }, null, 2),
      "utf-8",
    );
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await readFile(dataFilePath, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.folders)) {
      return { folders: [] };
    }
    return {
      folders: parsed.folders.map((folder) => ({
        id: String(folder.id ?? ""),
        path: normalizeFolderPath(folder.path),
        createdAt: String(folder.createdAt ?? ""),
        lastBackupAt: folder.lastBackupAt ? String(folder.lastBackupAt) : null,
      })),
    };
  } catch {
    return { folders: [] };
  }
}

async function writeStore(store) {
  await ensureDataFile();
  await writeFile(dataFilePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function listBackupFolders() {
  const store = await readStore();
  return store.folders;
}

export async function addBackupFolder(rawPath) {
  const folderPath = normalizeFolderPath(rawPath);
  if (!folderPath) {
    throw new Error("Folder path is required.");
  }
  const store = await readStore();
  const duplicated = store.folders.some(
    (item) => item.path.toLowerCase() === folderPath.toLowerCase(),
  );
  if (duplicated) {
    throw new Error("Folder already configured.");
  }
  const now = new Date().toISOString();
  const folder = {
    id: randomUUID(),
    path: folderPath,
    createdAt: now,
    lastBackupAt: null,
  };
  store.folders.push(folder);
  await writeStore(store);
  return folder;
}

export async function removeBackupFolder(id) {
  const folderId = String(id ?? "").trim();
  if (!folderId) {
    return false;
  }
  const store = await readStore();
  const nextFolders = store.folders.filter((folder) => folder.id !== folderId);
  const removed = nextFolders.length !== store.folders.length;
  if (!removed) {
    return false;
  }
  await writeStore({ folders: nextFolders });
  return true;
}

export async function touchBackupFolders(folderIds) {
  const ids = new Set((folderIds ?? []).map((id) => String(id)));
  if (!ids.size) {
    return [];
  }
  const store = await readStore();
  const now = new Date().toISOString();
  const updatedIds = [];
  const updatedFolders = store.folders.map((folder) => {
    if (!ids.has(folder.id)) {
      return folder;
    }
    updatedIds.push(folder.id);
    return { ...folder, lastBackupAt: now };
  });
  await writeStore({ folders: updatedFolders });
  return updatedIds;
}
