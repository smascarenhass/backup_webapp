import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(
  data: unknown,
  init: { status?: number; statusText?: string; ok?: boolean } = {},
) {
  const status = init.status ?? 200;
  const body = JSON.stringify(data);
  return new Response(body, {
    status,
    statusText: init.statusText ?? (status === 200 ? "OK" : "ERR"),
    headers: { "content-type": "application/json" },
  });
}

function textResponse(
  text: string,
  init: { status?: number; statusText?: string; ok?: boolean } = {},
) {
  const status = init.status ?? 200;
  return new Response(text, {
    status,
    statusText: init.statusText ?? (status === 200 ? "OK" : "ERR"),
  });
}

async function importService(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    vi.stubEnv(key, value);
  }

  return await import("../backupService.ts");
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("backupService", () => {
  it("fetchHealth calls expected URL and parses JSON", async () => {
    const { fetchHealth } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "ok", service: "backup-api" }, { status: 200 }),
    );

    const health = await fetchHealth();

    expect(health).toEqual({ status: "ok", service: "backup-api" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/health");
  });

  it("fetchHealth respects VITE_API_URL base", async () => {
    const { fetchHealth } = await importService({ VITE_API_URL: "http://api.local" });
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "ok", service: "backup-api" }, { status: 200 }),
    );

    await fetchHealth();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.local/api/health");
  });

  it("fetchHealth throws for non-OK and invalid JSON", async () => {
    const { fetchHealth } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(textResponse("nope{", { status: 500 }));

    await expect(fetchHealth()).rejects.toThrow("Health check failed: HTTP 500");
  });

  it("triggerBackup posts folderIds; maps 409; surfaces JSON detail; parses ok body", async () => {
    const { triggerBackup } = await importService({ VITE_API_URL: "" });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ok: true,
          message: "done",
          processedFolders: 1,
        },
        { status: 200 },
      ),
    );
    const ok = await triggerBackup(["a", "b"]);
    expect(ok).toEqual({
      ok: true,
      message: "done",
      processedFolders: 1,
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/backup/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderIds: ["a", "b"] }),
    });

    fetchMock.mockResolvedValueOnce(
      textResponse(JSON.stringify({ ok: false, detail: "boom" }), { status: 500 }),
    );
    await expect(triggerBackup()).rejects.toThrow("boom");
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ folderIds: [] }) }),
    );

    fetchMock.mockResolvedValueOnce(textResponse("x", { status: 409 }));
    await expect(triggerBackup()).rejects.toThrow("Já existe um backup em curso");
  });

  it("triggerBackup throws for empty 200 body", async () => {
    const { triggerBackup } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(
      new Response("", { status: 200, statusText: "OK" }),
    );
    await expect(triggerBackup()).rejects.toThrow("Empty response from trigger");
  });

  it("listBackupFolders maps folders; throws for invalid JSON", async () => {
    const { listBackupFolders } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(
      jsonResponse(
        { folders: [{ id: "1", path: "/a", createdAt: "t", lastBackupAt: null }] },
        { status: 200 },
      ),
    );
    const folders = await listBackupFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0]!.id).toBe("1");

    fetchMock.mockResolvedValue(textResponse("nope{", { status: 200 }));
    await expect(listBackupFolders()).rejects.toThrow("Invalid JSON");
  });

  it("createBackupFolder posts JSON and returns folder", async () => {
    const { createBackupFolder } = await importService({ VITE_API_URL: "" });
    const folder = {
      id: "1",
      path: "/a",
      createdAt: "t",
      lastBackupAt: null,
    };
    fetchMock.mockResolvedValue(jsonResponse({ folder }, { status: 201 }));

    const out = await createBackupFolder("/a");
    expect(out).toEqual(folder);
    expect(fetchMock).toHaveBeenCalledWith("/api/backup/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/a" }),
    });
  });

  it("updateBackupFolder encodes id and returns folder", async () => {
    const { updateBackupFolder } = await importService({ VITE_API_URL: "" });
    const folder = {
      id: "1",
      path: "/a",
      createdAt: "t",
      lastBackupAt: null,
    };
    fetchMock.mockResolvedValue(jsonResponse({ folder }, { status: 200 }));

    const out = await updateBackupFolder("a/b", "/x");
    expect(out).toEqual(folder);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backup/folders/a%2Fb",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/x" }),
      }),
    );
  });

  it("updateBackupFolder surfaces server detail and raw text on failure", async () => {
    const { updateBackupFolder } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(
      textResponse(JSON.stringify({ detail: "nope" }), { status: 400 }),
    );
    await expect(updateBackupFolder("1", "/x")).rejects.toThrow("nope");

    fetchMock.mockResolvedValue(textResponse("plain", { status: 400 }));
    await expect(updateBackupFolder("1", "/x")).rejects.toThrow("plain");
  });

  it("deleteBackupFolder is ok on 2xx; throws on error", async () => {
    const { deleteBackupFolder } = await importService({ VITE_API_URL: "" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteBackupFolder("1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/backup/folders/1", { method: "DELETE" });

    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(deleteBackupFolder("1")).rejects.toThrow("Folder deletion failed: HTTP 404");
  });

  it("settings fetch/update", async () => {
    const { fetchBackupSettings, updateBackupSettings } = await importService({
      VITE_API_URL: "",
    });
    const settings = {
      mainMountPath: "/a",
      backupMountPath: "/b",
      retention: { maxAgeDays: 1, maxBackups: 2 },
      autoBackup: {
        enabled: true,
        runAtHour: 2,
        runAtMinute: 3,
        timezone: "America/Sao_Paulo",
        folderIds: ["1"],
        lastScheduledRunDate: "2026-01-01",
      },
    };

    fetchMock.mockResolvedValueOnce(jsonResponse({ settings }, { status: 200 }));
    const s = await fetchBackupSettings();
    expect(s).toEqual(settings);

    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: s }, { status: 200 }));
    const saved = await updateBackupSettings(s);
    expect(saved).toEqual(s);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/backup/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
  });

  it("metrics/progress/history/processes", async () => {
    const {
      fetchBackupStorageMetrics,
      fetchBackupProgress,
      fetchBackupHistory,
      fetchBackupProcesses,
    } = await importService({ VITE_API_URL: "" });

    const metrics = {
      freeBytes: 1,
      totalBackupsSizeBytes: 2,
      historyEntries: 3,
      avgBackupSizeBytes: 4,
      backupFrequencyPerDay: 1,
      estimatedBackupsFit: 9,
      estimatedDaysFit: 1,
    };
    const progress = {
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
    const item = {
      id: "h1",
      folderId: "f1",
      folderPath: "/a",
      archivePath: "/b",
      sizeBytes: 1,
      durationMs: 2,
      createdAt: "t",
      triggerType: "manual" as const,
      version: 1,
    };
    const processes = {
      generatedAt: "t",
      serverTickMs: 1,
      internal: { progress },
      schedule: {
        autoBackupEnabled: false,
        runAtLocal: "02:03",
        timezone: "America/Sao_Paulo",
        folderIds: [],
        scheduledFolders: [],
        legacyAllFolders: true,
        lastScheduledRunDate: null,
        estimatedNextInternalRunAt: null,
        estimatedNextInternalRunNote: null,
      },
      externalBackupSync: {
        status: "unavailable" as const,
        containerName: "backup_sync",
        detail: "n/a",
        supercronicCronLine: null,
      },
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ metrics }, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ progress }, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ history: [item] }, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(processes, { status: 200 }));

    const m = await fetchBackupStorageMetrics();
    const p = await fetchBackupProgress();
    const h = await fetchBackupHistory();
    const proc = await fetchBackupProcesses();
    expect(m).toEqual(metrics);
    expect(p).toEqual(progress);
    expect(h).toEqual([item]);
    expect(proc).toEqual(processes);
  });

  it("searchDirectories encodes query params and default limit", async () => {
    const { searchDirectories } = await importService({ VITE_API_URL: "http://x" });
    fetchMock.mockImplementation(() =>
      jsonResponse(
        { basePath: "/hdds/main", directories: [] },
        { status: 200 },
      ),
    );
    await searchDirectories("/foo");
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.origin + firstUrl.pathname).toBe("http://x/api/fs/directories");
    expect(firstUrl.searchParams.get("q")).toBe("/foo");
    expect(firstUrl.searchParams.get("limit")).toBe("20");

    await searchDirectories("bar", 5);
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const lastUrl = new URL(String(lastCall?.[0]));
    expect(lastUrl.searchParams.get("q")).toBe("bar");
    expect(lastUrl.searchParams.get("limit")).toBe("5");
  });
});
