import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let originalCwd = process.cwd();
let tmpDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "backup-api-test-"));
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

describe("backupFoldersStore", () => {
  it("adds folders, rejects duplicates, updates paths, removes folder+history", async () => {
    const {
      addBackupFolder,
      listBackupFolders,
      updateBackupFolder,
      recordFolderBackup,
      listBackupHistory,
      removeBackupFolder,
    } = await import("../backupFoldersStore.mjs");

    const a = await addBackupFolder("/main/a");
    await expect(addBackupFolder("/main/a")).rejects.toThrow("already configured");

    const b = await addBackupFolder("/main/b");
    expect((await listBackupFolders()).map((f) => f.path).sort()).toEqual([
      "/main/a",
      "/main/b",
    ]);

    await recordFolderBackup({
      folderId: a.id,
      folderPath: a.path,
      archivePath: "/backup/a.tgz",
      sizeBytes: 10,
      durationMs: 1,
      triggerType: "manual",
    });

    const updated = await updateBackupFolder(a.id, "/main/a2");
    expect(updated.path).toBe("/main/a2");

    const history = await listBackupHistory();
    expect(history).toHaveLength(1);
    expect(history[0].folderPath).toBe("/main/a2");

    await removeBackupFolder(b.id);
    expect(await listBackupFolders()).toHaveLength(1);
    expect((await listBackupHistory())[0].folderId).toBe(a.id);
  });

  it("versions increment per folder", async () => {
    const { addBackupFolder, recordFolderBackup, listBackupHistory, peekNextBackupVersion } =
      await import("../backupFoldersStore.mjs");

    const folder = await addBackupFolder("/main/x");
    expect(await peekNextBackupVersion(folder.id)).toBe(1);

    await recordFolderBackup({
      folderId: folder.id,
      folderPath: folder.path,
      archivePath: "/backup/x1.tgz",
      sizeBytes: 1,
      triggerType: "manual",
    });
    await recordFolderBackup({
      folderId: folder.id,
      folderPath: folder.path,
      archivePath: "/backup/x2.tgz",
      sizeBytes: 2,
      triggerType: "manual",
    });

    const versions = (await listBackupHistory()).map((h) => h.version).sort();
    expect(versions).toEqual([1, 2]);
  });
});

describe("backupSettingsStore", () => {
  it("merges settings and validates folder ids for auto backup", async () => {
    const { addBackupFolder } = await import("../backupFoldersStore.mjs");
    const { readBackupSettings, updateBackupSettings } = await import(
      "../backupSettingsStore.mjs"
    );

    const f = await addBackupFolder("/main/z");

    const saved = await updateBackupSettings({
      mainMountPath: "/main",
      backupMountPath: "/backup",
      retention: { maxAgeDays: 7, maxBackups: 3 },
      autoBackup: {
        enabled: true,
        runAtHour: 3,
        runAtMinute: 4,
        timezone: "America/Sao_Paulo",
        folderIds: [f.id],
      },
    });

    expect(saved.mainMountPath).toBe("/main");
    expect(saved.backupMountPath).toBe("/backup");
    expect(saved.retention.maxAgeDays).toBe(7);
    expect(saved.autoBackup.folderIds).toEqual([f.id]);

    await expect(
      updateBackupSettings({
        autoBackup: { folderIds: ["nope"] },
      }),
    ).rejects.toThrow("Invalid backup folder id");

    const disk = JSON.parse(await readFile(path.join(tmpDir, "data", "backup-settings.json"), "utf-8"));
    expect(disk.autoBackup.folderIds).toEqual([f.id]);

    const loaded = await readBackupSettings();
    expect(loaded.mainMountPath).toBe("/main");
  });
});
