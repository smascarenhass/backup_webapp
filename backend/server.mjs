import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  addBackupFolder,
  listBackupFolders,
  removeBackupFolder,
  touchBackupFolders,
} from "./backupFoldersStore.mjs";

const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.PORT ?? "8011");
/** backup_sync container (optional); trigger returns warning if missing. */
const backupContainer =
  process.env.BACKUP_CONTAINER_NAME ?? "backup_sync";
const backupScriptPath =
  process.env.BACKUP_SCRIPT_PATH ?? "/app/backup_sync.sh";

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

app.post("/api/backup/folders", async (req, res) => {
  try {
    const folder = await addBackupFolder(req.body?.path);
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

app.post("/api/backup/trigger", async (req, res) => {
  try {
    const folders = await listBackupFolders();
    const requestedFolderIds = Array.isArray(req.body?.folderIds)
      ? req.body.folderIds.map((id) => String(id))
      : [];
    const targetFolderIds =
      requestedFolderIds.length > 0
        ? requestedFolderIds
        : folders.map((folder) => folder.id);

    const { stdout, stderr } = await execFileAsync("docker", [
      "exec",
      backupContainer,
      backupScriptPath,
    ]);
    const updatedFolderIds = await touchBackupFolders(targetFolderIds);
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    res.json({
      ok: true,
      message: out
        ? `Backup executed in container ${backupContainer}.`
        : `Command sent to container ${backupContainer}.`,
      processedFolders: updatedFolderIds.length,
      detail: out || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      ok: false,
      message:
        "Failed to run backup via Docker. Check whether the Docker socket is mounted and the container exists.",
      detail: msg,
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`backup-api listening on ${port}`);
});
