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
  recordFolderBackup,
  removeBackupHistoryEntries,
  removeBackupFolder,
} from "./backupFoldersStore.mjs";
import {
  readBackupSettings,
  updateBackupSettings,
} from "./backupSettingsStore.mjs";

const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.PORT ?? "8011");
const browseBasePath = process.env.BROWSE_BASE_PATH ?? "/hdds/main";

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

function parseDirectoryQuery(rawQuery, basePath) {
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const normalizedQuery = query.replace(/\\/g, "/");
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
  const allowedBasePath = settings.mainMountPath || browseBasePath;
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
    const resolvedPath = path.resolve(requestedPath);
    const resolvedMain = path.resolve(settings.mainMountPath || "/");
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

function buildSafeArchiveName(folderPath, stamp) {
  const normalized = folderPath.replaceAll(path.sep, "_").replaceAll("/", "_");
  const compact = normalized.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${stamp}-${compact || "folder"}.tar.gz`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function ensurePathReadable(targetPath) {
  await access(targetPath);
}

async function enforceRetention({ backupMountPath, maxAgeDays, maxBackups }) {
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
      ? entry.archivePath
      : path.join(backupMountPath, entry.archivePath);
    try {
      await rm(archivePath, { force: true });
      removedArchives += 1;
    } catch {
      // Ignore deletion failures, keep metadata cleanup below.
    }
  }
  await removeBackupHistoryEntries(toRemoveById);
  return { removedArchives };
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

app.post("/api/backup/trigger", async (req, res) => {
  try {
    const settings = await readBackupSettings();
    if (!settings.mainMountPath || !settings.backupMountPath) {
      return res.status(400).json({
        ok: false,
        message: "Configure main and backup mount paths before triggering backups.",
      });
    }
    await ensurePathReadable(settings.mainMountPath);
    await mkdir(settings.backupMountPath, { recursive: true });
    await ensurePathReadable(settings.backupMountPath);

    const folders = await listBackupFolders();
    if (!folders.length) {
      return res.status(400).json({
        ok: false,
        message: "No folders configured for backup.",
      });
    }
    const requestedFolderIds = Array.isArray(req.body?.folderIds)
      ? req.body.folderIds.map((id) => String(id))
      : [];
    const targetFolderIds =
      requestedFolderIds.length > 0
        ? requestedFolderIds
        : folders.map((folder) => folder.id);

    const targetFolders = folders.filter((folder) => targetFolderIds.includes(folder.id));
    const createdArchives = [];
    for (const folder of targetFolders) {
      const resolvedFolder = path.resolve(folder.path);
      const resolvedMain = path.resolve(settings.mainMountPath);
      if (
        resolvedFolder !== resolvedMain &&
        !resolvedFolder.startsWith(`${resolvedMain}${path.sep}`)
      ) {
        throw new Error(`Folder outside main mount path: ${folder.path}`);
      }
      await ensurePathReadable(resolvedFolder);
      const stamp = new Date().toISOString().replaceAll(":", "-");
      const archiveName = buildSafeArchiveName(folder.path, stamp);
      const archivePath = path.join(settings.backupMountPath, archiveName);
      await execFileAsync("tar", ["-czf", archivePath, "-C", resolvedFolder, "."]);
      const archiveStat = await stat(archivePath);
      await recordFolderBackup({
        folderId: folder.id,
        folderPath: folder.path,
        archivePath,
        sizeBytes: archiveStat.size,
      });
      createdArchives.push(archivePath);
    }

    const retentionResult = await enforceRetention({
      backupMountPath: settings.backupMountPath,
      maxAgeDays: settings.retention.maxAgeDays,
      maxBackups: settings.retention.maxBackups,
    });

    res.json({
      ok: true,
      message: `Backup finished for ${createdArchives.length} folder(s).`,
      processedFolders: createdArchives.length,
      removedByRetention: retentionResult.removedArchives,
      archives: createdArchives,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      ok: false,
      message: "Failed to execute compressed backup pipeline.",
      detail: msg,
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`backup-api listening on ${port}`);
});
