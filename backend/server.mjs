import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  readdir,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  addBackupFolder,
  listBackupFolders,
  listBackupHistory,
  peekNextBackupVersion,
  recordFolderBackup,
  removeBackupHistoryEntries,
  removeBackupFolder,
  updateBackupFolder,
} from "./backupFoldersStore.mjs";
import {
  patchLastScheduledRunDate,
  readBackupSettings,
  updateBackupSettings,
} from "./backupSettingsStore.mjs";

const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.PORT ?? "8011");
const browseBasePath = process.env.BROWSE_BASE_PATH ?? "/hdds/main";
const autoBackupTickMs = Number(process.env.AUTO_BACKUP_TICK_MS ?? "30000");
const backupSyncContainerName =
  process.env.BACKUP_SYNC_CONTAINER_NAME ??
  process.env.BACKUP_CONTAINER_NAME ??
  "backup_sync";

const backupProgress = {
  running: false,
  triggerType: null,
  startedAt: null,
  finishedAt: null,
  totalFolders: 0,
  processedFolders: 0,
  currentFolderPath: null,
  progressPct: 0,
  lastMessage: "Idle",
  lastError: null,
};

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "backup-api" });
});

app.get("/api/backup/folders", async (_req, res) => {
  try {
    const folders = await listBackupFolders();
    res.json({ folders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Failed to load backup folders.",
      detail: msg,
    });
  }
});

app.get("/api/backup/settings", async (_req, res) => {
  try {
    const settings = await readBackupSettings();
    res.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: "Failed to load settings.", detail: msg });
  }
});

app.put("/api/backup/settings", async (req, res) => {
  try {
    const settings = await updateBackupSettings(req.body);
    res.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("required") || msg.includes("absolute") ? 400 : 500;
    res.status(status).json({ message: "Failed to update settings.", detail: msg });
  }
});

function isPathInsideBase(targetPath, basePath) {
  return (
    targetPath === basePath ||
    targetPath.startsWith(`${basePath}${path.sep}`)
  );
}

function normalizeFsPath(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  const collapsed = withForwardSlashes.replace(/\/{2,}/g, "/");
  return path.resolve(collapsed);
}

function getZonedCalendarParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function ymdFromZonedParts(p) {
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${p.year}-${m}-${d}`;
}

function findUtcInstantForZonedWallClock(year, month, day, hour, minute, timeZone) {
  let lo = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 2, 0, 0, 0);
  const target =
    year * 1e10 +
    month * 1e8 +
    day * 1e6 +
    hour * 1e4 +
    minute * 100;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const p = getZonedCalendarParts(new Date(mid), timeZone);
    const key =
      p.year * 1e10 +
      p.month * 1e8 +
      p.day * 1e6 +
      p.hour * 1e4 +
      p.minute * 100;
    if (key === target) {
      return mid;
    }
    if (key < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

function addApproxCalendarDayInZone(year, month, day, timeZone) {
  const noon = findUtcInstantForZonedWallClock(year, month, day, 12, 0, timeZone);
  return getZonedCalendarParts(new Date(noon + 36 * 3600 * 1000), timeZone);
}

async function resolveAutoBackupFolderIds(settings) {
  const folders = await listBackupFolders();
  const configured = settings.autoBackup?.folderIds;
  if (configured === null) {
    return folders.map((f) => f.id);
  }
  const valid = new Set(folders.map((f) => f.id));
  return configured.filter((id) => valid.has(id));
}

function computeScheduleEstimate(settings) {
  if (!settings.autoBackup?.enabled) {
    return {
      estimatedNextInternalRunAt: null,
      estimatedNextInternalRunNote: "Auto backup desativado nas configurações.",
    };
  }
  const tz = settings.autoBackup.timezone;
  const runH = settings.autoBackup.runAtHour;
  const runM = settings.autoBackup.runAtMinute;
  const now = Date.now();
  const p = getZonedCalendarParts(new Date(now), tz);
  const ymdToday = ymdFromZonedParts(p);
  const last = settings.autoBackup.lastScheduledRunDate;
  let ty = p.year;
  let tmo = p.month;
  let td = p.day;
  if (last === ymdToday) {
    const tom = addApproxCalendarDayInZone(p.year, p.month, p.day, tz);
    ty = tom.year;
    tmo = tom.month;
    td = tom.day;
  } else {
    const todayRun = findUtcInstantForZonedWallClock(
      p.year,
      p.month,
      p.day,
      runH,
      runM,
      tz,
    );
    if (todayRun > now) {
      ty = p.year;
      tmo = p.month;
      td = p.day;
    } else {
      const tom = addApproxCalendarDayInZone(p.year, p.month, p.day, tz);
      ty = tom.year;
      tmo = tom.month;
      td = tom.day;
    }
  }
  const targetMs = findUtcInstantForZonedWallClock(ty, tmo, td, runH, runM, tz);
  const pad = (n) => String(n).padStart(2, "0");
  const note = `Diário às ${pad(runH)}:${pad(runM)} (${tz}).`;
  return {
    estimatedNextInternalRunAt: new Date(targetMs).toISOString(),
    estimatedNextInternalRunNote: note,
  };
}

function parseDirectoryQuery(rawQuery, basePathRaw) {
  const basePath = normalizeFsPath(basePathRaw);
  if (!basePath) {
    return { error: "Base path is not configured." };
  }
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const normalizedQuery = String(query).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const effectiveInput =
    normalizedQuery.length === 0
      ? basePath
      : path.isAbsolute(normalizedQuery)
        ? normalizedQuery
        : path.join(basePath, normalizedQuery);
  const resolvedInput = path.resolve(effectiveInput);

  if (!isPathInsideBase(resolvedInput, basePath)) {
    return { error: "Path must stay inside /hdds/main." };
  }

  const isDirectoryHint = normalizedQuery.endsWith("/");
  if (resolvedInput === basePath) {
    return {
      parentPath: basePath,
      prefix: "",
    };
  }
  const parentPath = isDirectoryHint
    ? resolvedInput
    : path.dirname(resolvedInput);
  const prefix = isDirectoryHint ? "" : path.basename(resolvedInput);

  if (!isPathInsideBase(parentPath, basePath)) {
    return { error: "Path must stay inside /hdds/main." };
  }

  return {
    parentPath,
    prefix,
  };
}

app.get("/api/fs/directories", async (req, res) => {
  const parsedLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 20;
  const settings = await readBackupSettings();
  const allowedBasePath = normalizeFsPath(
    settings.mainMountPath || browseBasePath,
  );
  const queryData = parseDirectoryQuery(req.query.q, allowedBasePath);

  if ("error" in queryData) {
    return res.status(400).json({
      message: "Invalid directory query.",
      detail: queryData.error,
    });
  }

  try {
    const entries = await readdir(queryData.parentPath, { withFileTypes: true });
    const normalizedPrefix = queryData.prefix.toLowerCase();
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name.toLowerCase().startsWith(normalizedPrefix))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, limit)
      .map((entry) => ({
        name: entry.name,
        path: path.join(queryData.parentPath, entry.name),
      }));

    return res.json({
      basePath: allowedBasePath,
      directories,
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err.code === "ENOENT" || err.code === "ENOTDIR")
    ) {
      return res.json({
        basePath: allowedBasePath,
        directories: [],
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      message: "Failed to search directories.",
      detail: msg,
    });
  }
});

app.post("/api/backup/folders", async (req, res) => {
  try {
    const settings = await readBackupSettings();
    const requestedPath = String(req.body?.path ?? "").trim();
    const resolvedPath = normalizeFsPath(requestedPath);
    const resolvedMain = normalizeFsPath(settings.mainMountPath || "/");
    if (
      !requestedPath ||
      (resolvedPath !== resolvedMain &&
        !resolvedPath.startsWith(`${resolvedMain}${path.sep}`))
    ) {
      return res.status(400).json({
        message: "Failed to add backup folder.",
        detail: "Folder must be inside the configured main mount path.",
      });
    }
    const folder = await addBackupFolder(resolvedPath);
    res.status(201).json({ folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("required") || msg.includes("configured") ? 400 : 500;
    res.status(status).json({
      message: "Failed to add backup folder.",
      detail: msg,
    });
  }
});

app.put("/api/backup/folders/:id", async (req, res) => {
  try {
    const settings = await readBackupSettings();
    const requestedPath = String(req.body?.path ?? "").trim();
    const resolvedPath = normalizeFsPath(requestedPath);
    const resolvedMain = normalizeFsPath(settings.mainMountPath || "/");
    if (
      !requestedPath ||
      (resolvedPath !== resolvedMain &&
        !resolvedPath.startsWith(`${resolvedMain}${path.sep}`))
    ) {
      return res.status(400).json({
        message: "Failed to update backup folder.",
        detail: "Folder must be inside the configured main mount path.",
      });
    }
    const folder = await updateBackupFolder(req.params.id, resolvedPath);
    res.json({ folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not found")
      ? 404
      : msg.includes("required") || msg.includes("configured")
        ? 400
        : 500;
    res.status(status).json({
      message: "Failed to update backup folder.",
      detail: msg,
    });
  }
});

app.delete("/api/backup/folders/:id", async (req, res) => {
  try {
    const removed = await removeBackupFolder(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: "Folder not found." });
    }
    return res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      message: "Failed to remove backup folder.",
      detail: msg,
    });
  }
});

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Relative path under backup mount: webapp/<UTC-YYYY>/<MM>/<DD>/<slug>-v<ver>_<HHMMSS>.tar.gz
 */
function buildWebappArchiveRelPath({ slug, version, now = new Date() }) {
  const y = now.getUTCFullYear();
  const mo = pad2(now.getUTCMonth() + 1);
  const d = pad2(now.getUTCDate());
  const hh = pad2(now.getUTCHours());
  const mm = pad2(now.getUTCMinutes());
  const ss = pad2(now.getUTCSeconds());
  const safeSlug = slug || "folder";
  const fileName = `${safeSlug}-v${version}_${hh}${mm}${ss}.tar.gz`;
  return path.join("webapp", String(y), mo, d, fileName);
}

function slugifyFolderPath(resolvedFolder, resolvedMainMount) {
  const folder = path.resolve(resolvedFolder);
  const main = path.resolve(resolvedMainMount);
  let rel;
  if (folder === main) {
    rel = "_root";
  } else if (folder.startsWith(`${main}${path.sep}`)) {
    rel = folder.slice(main.length + 1);
  } else {
    rel = path.basename(folder);
  }
  const forward = String(rel).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const slug = forward
    .replace(/\//g, "__")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return slug || "folder";
}

async function pruneEmptyParentsUpToRoot(deletedFilePath, backupMountRootRaw) {
  const root = normalizeFsPath(backupMountRootRaw);
  if (!root) {
    return;
  }
  let dir = path.dirname(deletedFilePath);
  while (dir.startsWith(`${root}${path.sep}`)) {
    try {
      const entries = await readdir(dir);
      if (entries.length > 0) {
        break;
      }
      await rm(dir, { maxRetries: 0 });
    } catch {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function ensurePathReadable(targetPath) {
  await access(targetPath);
}

async function enforceRetention({ backupMountPath, maxAgeDays, maxBackups }) {
  const backupRoot = normalizeFsPath(backupMountPath);
  const history = await listBackupHistory();
  const now = Date.now();
  const maxAgeMs = Math.max(1, maxAgeDays) * 24 * 60 * 60 * 1000;
  const sorted = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toRemoveById = [];

  for (const entry of sorted) {
    const createdAtMs = Date.parse(entry.createdAt);
    if (Number.isFinite(createdAtMs) && now - createdAtMs > maxAgeMs) {
      toRemoveById.push(entry.id);
    }
  }

  const remaining = sorted.filter((entry) => !toRemoveById.includes(entry.id));
  if (remaining.length > maxBackups) {
    const overflow = remaining.slice(maxBackups);
    for (const entry of overflow) {
      toRemoveById.push(entry.id);
    }
  }

  if (!toRemoveById.length) {
    return { removedArchives: 0 };
  }

  const byId = new Map(history.map((entry) => [entry.id, entry]));
  let removedArchives = 0;
  for (const id of toRemoveById) {
    const entry = byId.get(id);
    if (!entry) continue;
    const archivePath = path.isAbsolute(entry.archivePath)
      ? normalizeFsPath(entry.archivePath)
      : path.join(backupRoot, entry.archivePath);
    try {
      await rm(archivePath, { force: true });
      removedArchives += 1;
      await pruneEmptyParentsUpToRoot(archivePath, backupRoot);
    } catch {
      // Ignore deletion failures, keep metadata cleanup below.
    }
  }
  await removeBackupHistoryEntries(toRemoveById);
  return { removedArchives };
}

async function executeBackupPipeline({
  triggerType,
  requestedFolderIds,
}) {
  if (backupProgress.running) {
    throw new Error("Backup already running.");
  }
  backupProgress.running = true;
  backupProgress.triggerType = triggerType;
  backupProgress.startedAt = new Date().toISOString();
  backupProgress.finishedAt = null;
  backupProgress.totalFolders = 0;
  backupProgress.processedFolders = 0;
  backupProgress.currentFolderPath = null;
  backupProgress.progressPct = 0;
  backupProgress.lastMessage = "Preparing backup pipeline...";
  backupProgress.lastError = null;

  try {
    const settings = await readBackupSettings();
    if (!settings.mainMountPath || !settings.backupMountPath) {
      throw new Error("Configure main and backup mount paths before triggering backups.");
    }
    const resolvedMain = normalizeFsPath(settings.mainMountPath);
    const resolvedBackupMount = normalizeFsPath(settings.backupMountPath);
    if (!resolvedMain || !resolvedBackupMount) {
      throw new Error("Configure valid main and backup mount paths before triggering backups.");
    }
    await ensurePathReadable(resolvedMain);
    await mkdir(resolvedBackupMount, { recursive: true });
    await ensurePathReadable(resolvedBackupMount);

    const folders = await listBackupFolders();
    if (!folders.length) {
      throw new Error("No folders configured for backup.");
    }
    const targetFolderIds =
      requestedFolderIds.length > 0
        ? requestedFolderIds
        : folders.map((folder) => folder.id);

    const targetFolders = folders.filter((folder) => targetFolderIds.includes(folder.id));
    backupProgress.totalFolders = targetFolders.length;
    if (!targetFolders.length) {
      throw new Error("No matching folders selected for backup.");
    }

    const createdArchives = [];
    for (const folder of targetFolders) {
      backupProgress.currentFolderPath = folder.path;
      backupProgress.lastMessage = `Compressing ${folder.path}`;

      const resolvedFolder = path.resolve(folder.path);
      if (
        resolvedFolder !== resolvedMain &&
        !resolvedFolder.startsWith(`${resolvedMain}${path.sep}`)
      ) {
        throw new Error(`Folder outside main mount path: ${folder.path}`);
      }
      await ensurePathReadable(resolvedFolder);
      const nextVersion = await peekNextBackupVersion(folder.id);
      const slug = slugifyFolderPath(resolvedFolder, resolvedMain);
      const archiveRel = buildWebappArchiveRelPath({
        slug,
        version: nextVersion,
      });
      const archivePath = path.join(resolvedBackupMount, archiveRel);
      await mkdir(path.dirname(archivePath), { recursive: true });
      const compressStartedAt = Date.now();
      await execFileAsync("tar", ["-czf", archivePath, "-C", resolvedFolder, "."]);
      const compressDurationMs = Date.now() - compressStartedAt;
      const archiveStat = await stat(archivePath);
      await recordFolderBackup({
        folderId: folder.id,
        folderPath: folder.path,
        archivePath,
        sizeBytes: archiveStat.size,
        durationMs: compressDurationMs,
        triggerType,
        version: nextVersion,
      });
      createdArchives.push(archivePath);
      backupProgress.processedFolders += 1;
      backupProgress.progressPct = Math.round(
        (backupProgress.processedFolders / backupProgress.totalFolders) * 100,
      );
    }

    const retentionResult = await enforceRetention({
      backupMountPath: resolvedBackupMount,
      maxAgeDays: settings.retention.maxAgeDays,
      maxBackups: settings.retention.maxBackups,
    });

    backupProgress.lastMessage = `Backup finished (${createdArchives.length} folders).`;
    return {
      ok: true,
      message: `Backup finished for ${createdArchives.length} folder(s).`,
      processedFolders: createdArchives.length,
      removedByRetention: retentionResult.removedArchives,
      archives: createdArchives,
      triggerType,
    };
  } finally {
    backupProgress.running = false;
    backupProgress.finishedAt = new Date().toISOString();
    backupProgress.currentFolderPath = null;
    if (backupProgress.progressPct < 100 && !backupProgress.lastError) {
      backupProgress.progressPct =
        backupProgress.totalFolders > 0
          ? Math.round(
              (backupProgress.processedFolders / backupProgress.totalFolders) * 100,
            )
          : 0;
    }
  }
}

app.get("/api/backup/storage-metrics", async (_req, res) => {
  try {
    const settings = await readBackupSettings();
    if (!settings.backupMountPath) {
      return res.status(400).json({
        message: "Backup mount path is not configured.",
      });
    }
    const fsStats = await statfs(settings.backupMountPath);
    const freeBytes = Number(fsStats.bfree) * Number(fsStats.bsize);
    const history = await listBackupHistory();
    const historySizes = history.map((item) => Math.max(0, Number(item.sizeBytes ?? 0)));
    const totalBackupsSizeBytes = historySizes.reduce((sum, value) => sum + value, 0);
    const avgBackupSizeBytes = average(historySizes.slice(-20));

    const sortedByDate = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let backupFrequencyPerDay = 0;
    if (sortedByDate.length >= 2) {
      const first = Date.parse(sortedByDate[0].createdAt);
      const last = Date.parse(sortedByDate[sortedByDate.length - 1].createdAt);
      const days = Math.max((last - first) / (24 * 60 * 60 * 1000), 1 / 24);
      backupFrequencyPerDay = sortedByDate.length / days;
    }

    const estimatedBackupsFit =
      avgBackupSizeBytes > 0 ? Math.floor(freeBytes / avgBackupSizeBytes) : null;
    const estimatedDaysFit =
      estimatedBackupsFit !== null && backupFrequencyPerDay > 0
        ? estimatedBackupsFit / backupFrequencyPerDay
        : null;

    return res.json({
      metrics: {
        freeBytes,
        totalBackupsSizeBytes,
        historyEntries: history.length,
        avgBackupSizeBytes: avgBackupSizeBytes || null,
        backupFrequencyPerDay: backupFrequencyPerDay || null,
        estimatedBackupsFit,
        estimatedDaysFit,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      message: "Failed to load storage metrics.",
      detail: msg,
    });
  }
});

app.get("/api/backup/history", async (_req, res) => {
  try {
    const history = await listBackupHistory();
    const sorted = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ history: sorted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      message: "Failed to load backup history.",
      detail: msg,
    });
  }
});

app.get("/api/backup/progress", (_req, res) => {
  return res.json({ progress: backupProgress });
});

function truncateText(value, maxLen) {
  const text = String(value ?? "");
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

function isSafeContainerName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(String(name ?? ""));
}

async function inspectDockerContainer(containerName) {
  if (!isSafeContainerName(containerName)) {
    return {
      status: "invalid_name",
      containerName,
      detail: "Invalid container name configuration.",
    };
  }
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      containerName,
    ]);
    const data = JSON.parse(stdout);
    const info = Array.isArray(data) ? data[0] : data;
    const state = info?.State ?? {};
    const health = state?.Health?.Status ?? null;
    return {
      status: "ok",
      containerName,
      dockerState: String(state.Status ?? "unknown"),
      startedAt: state.StartedAt ?? null,
      finishedAt: state.FinishedAt ?? null,
      exitCode:
        typeof state.ExitCode === "number" ? state.ExitCode : null,
      restartCount:
        typeof info?.RestartCount === "number" ? info.RestartCount : null,
      healthStatus: health,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "unavailable",
      containerName,
      detail: truncateText(msg, 500),
    };
  }
}

async function readBackupSyncCronLine(containerName) {
  if (!isSafeContainerName(containerName)) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("docker", [
      "exec",
      containerName,
      "sh",
      "-lc",
      "if [ -f /etc/supercronic.cron ]; then cat /etc/supercronic.cron; fi",
    ]);
    const line = String(stdout ?? "").trim();
    return line ? truncateText(line, 4000) : null;
  } catch {
    return null;
  }
}

app.get("/api/backup/processes", async (_req, res) => {
  try {
    const settings = await readBackupSettings();
    const estimate = computeScheduleEstimate(settings);
    const folders = await listBackupFolders();
    const resolvedIds = await resolveAutoBackupFolderIds(settings);
    const scheduledFolders = folders
      .filter((f) => resolvedIds.includes(f.id))
      .map((f) => ({ id: f.id, path: f.path }));
    const pad = (n) => String(n).padStart(2, "0");
    const runAtLocal = `${pad(settings.autoBackup.runAtHour)}:${pad(
      settings.autoBackup.runAtMinute,
    )}`;

    const externalInspect = await inspectDockerContainer(backupSyncContainerName);
    let externalCronLine = null;
    if (externalInspect.status === "ok" && externalInspect.dockerState === "running") {
      externalCronLine = await readBackupSyncCronLine(backupSyncContainerName);
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      serverTickMs: autoBackupTickMs,
      internal: {
        progress: { ...backupProgress },
      },
      schedule: {
        autoBackupEnabled: Boolean(settings.autoBackup?.enabled),
        runAtLocal,
        timezone: settings.autoBackup.timezone,
        folderIds: resolvedIds,
        scheduledFolders,
        legacyAllFolders: settings.autoBackup.folderIds === null,
        lastScheduledRunDate: settings.autoBackup.lastScheduledRunDate,
        estimatedNextInternalRunAt: estimate.estimatedNextInternalRunAt,
        estimatedNextInternalRunNote: estimate.estimatedNextInternalRunNote,
      },
      externalBackupSync: {
        ...externalInspect,
        supercronicCronLine: externalCronLine,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      message: "Failed to load backup processes.",
      detail: msg,
    });
  }
});

app.post("/api/backup/trigger", async (req, res) => {
  try {
    const requestedFolderIds = Array.isArray(req.body?.folderIds)
      ? req.body.folderIds.map((id) => String(id))
      : [];
    const result = await executeBackupPipeline({
      triggerType: "manual",
      requestedFolderIds,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backupProgress.lastError = msg;
    backupProgress.lastMessage = "Backup failed.";
    res.status(500).json({
      ok: false,
      message: "Failed to execute compressed backup pipeline.",
      detail: msg,
    });
  }
});

setInterval(async () => {
  if (backupProgress.running) {
    return;
  }
  try {
    const settings = await readBackupSettings();
    if (!settings.autoBackup?.enabled) {
      return;
    }
    const tz = settings.autoBackup.timezone;
    const runH = settings.autoBackup.runAtHour;
    const runM = settings.autoBackup.runAtMinute;
    const now = Date.now();
    const p = getZonedCalendarParts(new Date(now), tz);
    const ymdToday = ymdFromZonedParts(p);
    const nowMin = p.hour * 60 + p.minute;
    const runMinTotal = runH * 60 + runM;
    const last = settings.autoBackup.lastScheduledRunDate;
    if (last === ymdToday) {
      return;
    }
    if (nowMin < runMinTotal) {
      return;
    }
    const resolvedIds = await resolveAutoBackupFolderIds(settings);
    if (!resolvedIds.length) {
      backupProgress.lastMessage =
        "Auto backup: nenhuma pasta selecionada no agendamento.";
      return;
    }
    await executeBackupPipeline({
      triggerType: "automatic",
      requestedFolderIds: resolvedIds,
    });
    await patchLastScheduledRunDate(ymdToday);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backupProgress.lastError = msg;
    backupProgress.lastMessage = "Automatic backup failed.";
  }
}, autoBackupTickMs);

app.listen(port, "0.0.0.0", () => {
  console.log(`backup-api listening on ${port}`);
});
