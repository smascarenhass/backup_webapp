import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** @type {((...args: any[]) => unknown) | null} */
let execFileHandler = null;

/** @type {import("node:child_process").execFile | null} */
let realChildProcessExecFile = null;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  realChildProcessExecFile = actual.execFile.bind(actual);
  return {
    ...actual,
    execFile(...args) {
      if (execFileHandler) {
        return execFileHandler(...args);
      }
      return realChildProcessExecFile(...args);
    },
  };
});

let originalCwd = process.cwd();
let tmpDir = "";
/** @type {import("node:http").Server | null} */
let httpServer = null;

beforeEach(async () => {
  execFileHandler = null;
  httpServer = null;
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "backup-api-http-test-"));
  process.chdir(tmpDir);
});

afterEach(async () => {
  execFileHandler = null;
  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    httpServer = null;
  }
  vi.restoreAllMocks();
  vi.resetModules();
  process.chdir(originalCwd);
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

async function writeJson(relPath, data) {
  const full = path.join(tmpDir, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeExecFileArgs(args) {
  const cmd = args[0];
  const argv = args[1];
  let options;
  /** @type {((err: unknown, stdout?: string, stderr?: string) => void) | undefined} */
  let callback;
  if (typeof args[2] === "function") {
    options = undefined;
    callback = args[2];
  } else {
    options = args[2];
    callback = args[3];
  }
  return { cmd, argv, options, callback };
}

async function listenHttp(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to bind ephemeral HTTP port for tests.");
  }
  httpServer = server;
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("server HTTP (backup trigger)", () => {
  it("runs backup pipeline and records history (tar mocked)", async () => {
    const main = path.join(tmpDir, "main");
    const backup = path.join(tmpDir, "backup");
    const src = path.join(main, "docs");
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, "hello.txt"), "hi", "utf-8");

    const folderId = "11111111-1111-1111-1111-111111111111";
    await writeJson("data/backup-folders.json", {
      folders: [
        {
          id: folderId,
          path: src,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastBackupAt: null,
        },
      ],
      backupHistory: [],
    });

    await writeJson("data/backup-settings.json", {
      mainMountPath: main,
      backupMountPath: backup,
      retention: { maxAgeDays: 30, maxBackups: 30 },
      autoBackup: {
        enabled: false,
        runAtHour: 2,
        runAtMinute: 0,
        timezone: "America/Sao_Paulo",
        folderIds: null,
        lastScheduledRunDate: null,
      },
    });

    execFileHandler = (...execArgs) => {
      const { cmd, argv, options, callback } = normalizeExecFileArgs(execArgs);
      if (!callback) {
        throw new Error("execFile mock expected a callback");
      }
      if (cmd === "tar" && Array.isArray(argv) && argv[0] === "-czf") {
        const outFile = argv[1];
        // Minimal gzip payload (not a real tar) — enough for stat() + pipeline.
        const gzipHeader = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
        import("node:fs/promises")
          .then((fs) => fs.mkdir(path.dirname(outFile), { recursive: true }))
          .then(() => import("node:fs/promises").then((fs) => fs.writeFile(outFile, gzipHeader)))
          .then(() => callback(null, "", ""))
          .catch((err) => callback(err));
        return {};
      }
      return options === undefined
        ? realChildProcessExecFile(cmd, argv, callback)
        : realChildProcessExecFile(cmd, argv, options, callback);
    };

    const { app } = await import("../server.mjs");
    await listenHttp(app);

    const res = await request(app).post("/api/backup/trigger").send({ folderIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.processedFolders).toBe(1);

    const histRes = await request(app).get("/api/backup/history");
    expect(histRes.status).toBe(200);
    expect(histRes.body.history.length).toBe(1);
    expect(histRes.body.history[0].folderId).toBe(folderId);
  });

  it("returns 409 when a backup is already running", async () => {
    const main = path.join(tmpDir, "main");
    const backup = path.join(tmpDir, "backup");
    const src = path.join(main, "docs");
    await mkdir(src, { recursive: true });

    const folderId = "22222222-2222-2222-2222-222222222222";
    await writeJson("data/backup-folders.json", {
      folders: [
        {
          id: folderId,
          path: src,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastBackupAt: null,
        },
      ],
      backupHistory: [],
    });

    await writeJson("data/backup-settings.json", {
      mainMountPath: main,
      backupMountPath: backup,
      retention: { maxAgeDays: 30, maxBackups: 30 },
      autoBackup: {
        enabled: false,
        runAtHour: 2,
        runAtMinute: 0,
        timezone: "America/Sao_Paulo",
        folderIds: null,
        lastScheduledRunDate: null,
      },
    });

    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    execFileHandler = (...execArgs) => {
      const { cmd, argv, options, callback } = normalizeExecFileArgs(execArgs);
      if (!callback) {
        throw new Error("execFile mock expected a callback");
      }
      if (cmd === "tar") {
        void firstGate.then(() => {
          const outFile = argv[1];
          const gzipHeader = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
          import("node:fs/promises")
            .then((fs) => fs.mkdir(path.dirname(outFile), { recursive: true }))
            .then(() => import("node:fs/promises").then((fs) => fs.writeFile(outFile, gzipHeader)))
            .then(() => callback(null, "", ""))
            .catch((err) => callback(err));
        });
        return {};
      }
      return options === undefined
        ? realChildProcessExecFile(cmd, argv, callback)
        : realChildProcessExecFile(cmd, argv, options, callback);
    };

    const { app } = await import("../server.mjs");
    const { baseUrl } = await listenHttp(app);

    const triggerUrl = `${baseUrl}/api/backup/trigger`;
    const p1 = fetch(triggerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderIds: [] }),
    });
    await new Promise((r) => setTimeout(r, 25));
    const p2 = fetch(triggerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderIds: [] }),
    });

    const res2 = await p2;
    expect(res2.status).toBe(409);

    releaseFirst();
    const res1 = await p1;
    expect(res1.status).toBe(200);
  });
});
