import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./packExport", () => ({ assemblePackExport: vi.fn() }));
vi.mock("./obsidian", () => ({ buildObsidianBundle: vi.fn() }));
vi.mock("./learnConfig", () => ({ getObsidianVaultPath: vi.fn() }));
vi.mock("./localVault", () => ({ writeLocalVault: vi.fn() }));
vi.mock("./githubVault", () => ({ writeGithubVault: vi.fn(), isGithubConfigured: vi.fn(() => false) }));
vi.mock("@/lib/db/learnExportRepo", () => ({
  learnExportRepo: { findByIdempotencyKey: vi.fn(), record: vi.fn(), listForPack: vi.fn() },
}));

import { exportPackToChannel } from "./exportService";
import { assemblePackExport } from "./packExport";
import { buildObsidianBundle } from "./obsidian";
import { getObsidianVaultPath } from "./learnConfig";
import { writeLocalVault } from "./localVault";
import { learnExportRepo } from "@/lib/db/learnExportRepo";
import type { ChannelResult } from "./obsidianExport";

const readyPack = { id: "pack_1", status: "ready" } as never;
const bundle = {
  folderName: "F",
  packId: "pack_1",
  manifestHash: "h1",
  files: [],
  meta: { pipelineVersion: "v2", promptVersion: "v2", sourceBasis: "transcript", sourceKind: "youtube", qaVerdict: "pass", qaCoverage: 0.8, fileCount: 0 },
} as never;

const okResult: ChannelResult = {
  channel: "local_vault",
  state: "succeeded",
  written: 3,
  unchanged: 0,
  failed: 0,
  conflict: 0,
  manifestHash: "h1",
  targetLabel: "yerel vault",
  targetFingerprint: "fp1",
  files: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildObsidianBundle).mockReturnValue(bundle);
  // varsayılan: prior yok (idempotency testi kendi override eder). clearAllMocks
  // mockResolvedValue implementasyonunu SIFIRLAMAZ → burada açıkça null'a çek.
  vi.mocked(learnExportRepo.findByIdempotencyKey).mockResolvedValue(null);
});

describe("exportPackToChannel — idempotency", () => {
  it("aynı idempotencyKey ikinci kez → deduped (assemble/write ÇAĞRILMAZ)", async () => {
    vi.mocked(learnExportRepo.findByIdempotencyKey).mockResolvedValue({
      channel: "local_vault",
      state: "succeeded",
      writtenCount: 3,
      unchangedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      manifestHash: "h1",
      targetFingerprint: "fp1",
      errorClass: null,
    } as never);
    const out = await exportPackToChannel("pack_1", "local_vault", { idempotencyKey: "key-1" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.message).toContain("idempotent");
    expect(assemblePackExport).not.toHaveBeenCalled();
    expect(writeLocalVault).not.toHaveBeenCalled();
  });
});

describe("exportPackToChannel — gating", () => {
  it("pack yok → not_found", async () => {
    vi.mocked(assemblePackExport).mockResolvedValue(null);
    const out = await exportPackToChannel("pack_x", "local_vault");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not_found");
  });

  it("hazır değil → not_ready + attempt KAYDEDİLMEZ", async () => {
    vi.mocked(assemblePackExport).mockResolvedValue({ id: "pack_1", status: "qa_pending" } as never);
    const out = await exportPackToChannel("pack_1", "local_vault");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.state).toBe("not_ready");
    expect(learnExportRepo.record).not.toHaveBeenCalled();
  });

  it("local vault configured değil → not_configured + kayıt yok", async () => {
    vi.mocked(assemblePackExport).mockResolvedValue(readyPack);
    vi.mocked(getObsidianVaultPath).mockReturnValue(null);
    const out = await exportPackToChannel("pack_1", "local_vault");
    if (out.ok) expect(out.result.state).toBe("not_configured");
    expect(learnExportRepo.record).not.toHaveBeenCalled();
  });
});

describe("exportPackToChannel — gerçek yazma audit'lenir", () => {
  it("succeeded → LearnExportAttempt kaydı (doğru sayılarla)", async () => {
    vi.mocked(assemblePackExport).mockResolvedValue(readyPack);
    vi.mocked(getObsidianVaultPath).mockReturnValue("/tmp/vault");
    vi.mocked(writeLocalVault).mockResolvedValue(okResult);
    const out = await exportPackToChannel("pack_1", "local_vault", { idempotencyKey: "k9" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.state).toBe("succeeded");
    expect(learnExportRepo.record).toHaveBeenCalledOnce();
    const arg = vi.mocked(learnExportRepo.record).mock.calls[0][0];
    expect(arg.state).toBe("succeeded");
    expect(arg.writtenCount).toBe(3);
    expect(arg.targetFingerprint).toBe("fp1");
    expect(arg.idempotencyKey).toBe("k9");
  });
});
