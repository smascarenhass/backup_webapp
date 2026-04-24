import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const dataFilePath = path.join(dataDir, "backup-settings.json");

const defaultSettings = {
  mainMountPath: "",
  backupMountPath: "",
  retention: {
    maxAgeDays: 30,
    maxBackups: 30,
  },
};

function normalizePath(value) {
  return String(value ?? "").trim();
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const retention =
    source.retention && typeof source.retention === "object"
      ? source.retention
      : {};
  return {
    mainMountPath: normalizePath(source.mainMountPath),
    backupMountPath: normalizePath(source.backupMountPath),
    retention: {
      maxAgeDays: normalizePositiveInt(
        retention.maxAgeDays,
        defaultSettings.retention.maxAgeDays,
      ),
      maxBackups: normalizePositiveInt(
        retention.maxBackups,
        defaultSettings.retention.maxBackups,
      ),
    },
  };
}

async function ensureSettingsFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFilePath, "utf-8");
  } catch {
    await writeFile(dataFilePath, JSON.stringify(defaultSettings, null, 2), "utf-8");
  }
}

export async function readBackupSettings() {
  await ensureSettingsFile();
  const raw = await readFile(dataFilePath, "utf-8");
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

export async function updateBackupSettings(input) {
  const next = normalizeSettings(input);
  if (!next.mainMountPath) {
    throw new Error("Main mount path is required.");
  }
  if (!next.backupMountPath) {
    throw new Error("Backup mount path is required.");
  }
  if (!path.isAbsolute(next.mainMountPath) || !path.isAbsolute(next.backupMountPath)) {
    throw new Error("Mount paths must be absolute.");
  }
  await ensureSettingsFile();
  await writeFile(dataFilePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
