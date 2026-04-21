import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

app.post("/api/backup/trigger", async (_req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync("docker", [
      "exec",
      backupContainer,
      backupScriptPath,
    ]);
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    res.json({
      ok: true,
      message: out
        ? `Backup executed in container ${backupContainer}.`
        : `Command sent to container ${backupContainer}.`,
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
