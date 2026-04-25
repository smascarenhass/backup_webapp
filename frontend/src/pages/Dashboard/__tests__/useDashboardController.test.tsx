import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchHealth, triggerBackup } = vi.hoisted(() => ({
  fetchHealth: vi.fn(),
  triggerBackup: vi.fn(),
}));

vi.mock("../../../services/backupService", () => ({
  fetchHealth,
  triggerBackup,
}));

import { useDashboardController } from "../controller";

describe("useDashboardController", () => {
  beforeEach(() => {
    fetchHealth.mockReset();
    triggerBackup.mockReset();
    fetchHealth.mockResolvedValue({ status: "ok", service: "backup-api" });
  });

  it("carrega health ao montar", async () => {
    const { result } = renderHook(() => useDashboardController());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(result.current.health).toEqual({
      status: "ok",
      service: "backup-api",
    });
    expect(result.current.error).toBeNull();
  });

  it("trigger com sucesso preenche triggerMsg", async () => {
    triggerBackup.mockResolvedValue({
      ok: true,
      message: "Backup concluído.",
      processedFolders: 1,
    });

    const { result } = renderHook(() => useDashboardController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.triggerMsg).toBe("Backup concluído.");
    expect(result.current.error).toBeNull();
  });

  it("mensagem de backup em curso vai para triggerMsg, não error", async () => {
    triggerBackup.mockRejectedValue(
      new Error("Já existe um backup em curso. Aguarde."),
    );

    const { result } = renderHook(() => useDashboardController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.triggerMsg).toContain("Já existe um backup em curso");
  });

  it("outros erros de trigger preenchem error", async () => {
    triggerBackup.mockRejectedValue(new Error("falha de rede"));

    const { result } = renderHook(() => useDashboardController());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.triggerMsg).toBeNull();
    expect(result.current.error).toBe("falha de rede");
  });
});
