import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listBackupFolders } from "./backupFoldersStore.mjs";

const dataDir = path.resolve(process.cwd(), "data");
const dataFilePath = path.join(dataDir, "backup-settings.json");

const defaultSettings = {
  mainMountPath: "",
  backupMountPath: "",
  retention: {
    maxAgeDays: 30,
    maxBackups: 30,
  },
  autoBackup: {
    enabled: false,
    runAtHour: 2,
    runAtMinute: 0,
    timezone: "America/Sao_Paulo",
    folderIds: null,
    lastScheduledRunDate: null,
  },
  performance: {
    profile: "balanced",
    compressionFormat: "gz",
    compressionLevel: 3,
    maxConcurrency: 2,
    excludePatterns: [],
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

const DEFAULT_TZ = "America/Sao_Paulo";

function normalizeRunAtHourMinute(autoBackup) {
  if (
    typeof autoBackup.runAt === "string" &&
    /^\d{1,2}:\d{2}$/.test(String(autoBackup.runAt).trim())
  ) {
    const [hs, ms] = String(autoBackup.runAt).trim().split(":");
    const h = Number.parseInt(hs, 10);
    const m = Number.parseInt(ms, 10);
    if (
      Number.isFinite(h) &&
      Number.isFinite(m) &&
      h >= 0 &&
      h <= 23 &&
      m >= 0 &&
      m <= 59
    ) {
      return { runAtHour: h, runAtMinute: m };
    }
  }
  const h = Number(autoBackup.runAtHour);
  const m = Number(autoBackup.runAtMinute);
  if (
    Number.isFinite(h) &&
    Number.isFinite(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59
  ) {
    return { runAtHour: Math.floor(h), runAtMinute: Math.floor(m) };
  }
  return { runAtHour: 2, runAtMinute: 0 };
}

function normalizeTimezone(autoBackup) {
  const tz = String(autoBackup.timezone ?? "").trim();
  return tz || DEFAULT_TZ;
}

function normalizeFolderIds(autoBackup) {
  if (!Object.prototype.hasOwnProperty.call(autoBackup, "folderIds")) {
    return null;
  }
  if (!Array.isArray(autoBackup.folderIds)) {
    return [];
  }
  return [
    ...new Set(
      autoBackup.folderIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeLastScheduledRunDate(autoBackup) {
  const v = autoBackup.lastScheduledRunDate;
  if (v === null || v === undefined || v === "") {
    return null;
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v;
  }
  return null;
}

const MAX_EXCLUDE_PATTERNS = 64;
const MAX_EXCLUDE_PATTERN_LENGTH = 256;
const ALLOWED_PROFILE = new Set([
  "conservative",
  "balanced",
  "aggressive",
  "custom",
]);
const ALLOWED_COMPRESSION_FORMAT = new Set(["gz", "xz"]);

function normalizePerformance(rawPerformance) {
  const perf =
    rawPerformance && typeof rawPerformance === "object" ? rawPerformance : {};
  const profileRaw = String(perf.profile ?? "").trim().toLowerCase();
  const profile = ALLOWED_PROFILE.has(profileRaw)
    ? profileRaw
    : defaultSettings.performance.profile;
  const formatRaw = String(perf.compressionFormat ?? "").trim().toLowerCase();
  const compressionFormat = ALLOWED_COMPRESSION_FORMAT.has(formatRaw)
    ? formatRaw
    : profile === "aggressive"
      ? "gz"
      : profile === "conservative"
        ? "xz"
        : defaultSettings.performance.compressionFormat;
  const fallbackLevelByProfile =
    profile === "conservative" ? 6 : profile === "aggressive" ? 1 : 3;
  const minLevel = compressionFormat === "xz" ? 0 : 1;
  const maxLevel = 9;
  const parsedLevel = Number.parseInt(String(perf.compressionLevel ?? ""), 10);
  const compressionLevel =
    Number.isFinite(parsedLevel) && parsedLevel >= minLevel && parsedLevel <= maxLevel
      ? parsedLevel
      : fallbackLevelByProfile;

  const parsedConcurrency = Number.parseInt(String(perf.maxConcurrency ?? ""), 10);
  const fallbackConcurrency =
    profile === "conservative" ? 1 : profile === "aggressive" ? 4 : 2;
  const maxConcurrency =
    Number.isFinite(parsedConcurrency) && parsedConcurrency >= 1 && parsedConcurrency <= 8
      ? parsedConcurrency
      : fallbackConcurrency;

  const sourcePatterns = Array.isArray(perf.excludePatterns)
    ? perf.excludePatterns
    : [];
  const excludePatterns = [
    ...new Set(
      sourcePatterns
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .filter((entry) => entry.length <= MAX_EXCLUDE_PATTERN_LENGTH),
    ),
  ].slice(0, MAX_EXCLUDE_PATTERNS);

  return {
    profile,
    compressionFormat,
    compressionLevel,
    maxConcurrency,
    excludePatterns,
  };
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const retention =
    source.retention && typeof source.retention === "object"
      ? source.retention
      : {};
  const autoBackup =
    source.autoBackup && typeof source.autoBackup === "object"
      ? source.autoBackup
      : {};
  const { runAtHour, runAtMinute } = normalizeRunAtHourMinute(autoBackup);
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
    autoBackup: {
      enabled: Boolean(autoBackup.enabled),
      runAtHour,
      runAtMinute,
      timezone: normalizeTimezone(autoBackup),
      folderIds: normalizeFolderIds(autoBackup),
      lastScheduledRunDate: normalizeLastScheduledRunDate(autoBackup),
    },
    performance: normalizePerformance(source.performance),
  };
}

async function ensureSettingsFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFilePath, "utf-8");
  } catch {
    await writeFile(
      dataFilePath,
      JSON.stringify(defaultSettings, null, 2),
      "utf-8",
    );
  }
}

export async function readBackupSettings() {
  await ensureSettingsFile();
  const raw = await readFile(dataFilePath, "utf-8");
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return normalizeSettings({ ...defaultSettings });
  }
}

export async function patchLastScheduledRunDate(ymd) {
  const value = String(ymd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("lastScheduledRunDate must be YYYY-MM-DD.");
  }
  await ensureSettingsFile();
  let rawObj = {};
  try {
    rawObj = JSON.parse(await readFile(dataFilePath, "utf-8"));
  } catch {
    rawObj = { ...defaultSettings };
  }
  rawObj.autoBackup = rawObj.autoBackup && typeof rawObj.autoBackup === "object"
    ? rawObj.autoBackup
    : {};
  rawObj.autoBackup.lastScheduledRunDate = value;
  await writeFile(dataFilePath, JSON.stringify(rawObj, null, 2), "utf-8");
}

export async function updateBackupSettings(input) {
  await ensureSettingsFile();
  let existing = {};
  try {
    existing = JSON.parse(await readFile(dataFilePath, "utf-8"));
  } catch {
    existing = {};
  }
  const inc = input && typeof input === "object" ? input : {};
  const merged = {
    ...existing,
    ...inc,
    retention: {
      ...(existing.retention && typeof existing.retention === "object"
        ? existing.retention
        : {}),
      ...(inc.retention && typeof inc.retention === "object" ? inc.retention : {}),
    },
    autoBackup: {
      ...(existing.autoBackup && typeof existing.autoBackup === "object"
        ? existing.autoBackup
        : {}),
      ...(inc.autoBackup && typeof inc.autoBackup === "object"
        ? inc.autoBackup
        : {}),
    },
  };
  const next = normalizeSettings(merged);
  if (!next.mainMountPath) {
    throw new Error("Main mount path is required.");
  }
  if (!next.backupMountPath) {
    throw new Error("Backup mount path is required.");
  }
  if (!path.isAbsolute(next.mainMountPath) || !path.isAbsolute(next.backupMountPath)) {
    throw new Error("Mount paths must be absolute.");
  }
  for (const pattern of next.performance.excludePatterns) {
    if (!/^[a-zA-Z0-9_./*?@+-]+$/.test(pattern)) {
      throw new Error(`Invalid exclude pattern: ${pattern}`);
    }
  }
  if (next.autoBackup.folderIds !== null) {
    const folders = await listBackupFolders();
    const valid = new Set(folders.map((f) => f.id));
    for (const id of next.autoBackup.folderIds) {
      if (!valid.has(id)) {
        throw new Error(`Invalid backup folder id in auto backup schedule: ${id}`);
      }
    }
  }
  await writeFile(dataFilePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
