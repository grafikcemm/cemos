import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    account: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import {
  getRuntimeProfile,
  isKnownAccountHandleDb,
  assertKnownAccountHandleDb,
  listAccountEntries,
  listGenerationReadyHandles,
  resolveCronHandles,
  invalidateAccountProfileCache,
  AccountProfileError,
} from "@/lib/accounts/profileRepository";

const mockFindMany = vi.mocked(prisma.account.findMany);

function dbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    handle: "grafikcem",
    xHandle: "@grafikcem",
    persona: "Pratik Tasarım × AI operatörü",
    concept: "Araç testleri ve görsel içerik",
    maxChars: 1500,
    platform: "x",
    displayName: "GrafikCem",
    language: "Turkish",
    autonomy: "Gunluk denetimli autopilot",
    defaultDraftCount: 5,
    formatsJson: JSON.stringify(["punch", "thread"]),
    benchmarkInput: "test",
    profileStatus: "active",
    isActive: true,
    profileVersion: 1,
    styleProfile: {
      toneRules: JSON.stringify(["ton kuralı"]),
      formatRules: JSON.stringify(["format kuralı"]),
      forbiddenRules: JSON.stringify(["yasak kural"]),
      modes: JSON.stringify([
        { id: "punch_mode", label: "Punch", instruction: "kısa keskin yaz", format: "punch" },
      ]),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateAccountProfileCache();
});

describe("profileRepository (ADR-031) — DB runtime source of truth", () => {
  it("mevcut hesap DB'den yüklenir; JSON alanları Zod'dan geçer", async () => {
    mockFindMany.mockResolvedValue([dbRow()] as never);
    const p = await getRuntimeProfile("grafikcem");
    expect(p.persona).toBe("Pratik Tasarım × AI operatörü");
    expect(p.toneRules).toEqual(["ton kuralı"]);
    expect(p.modes[0].id).toBe("punch_mode");
    expect(p.degraded).toBe(false);
  });

  it("bilinmeyen handle fail-closed: unknown_handle", async () => {
    mockFindMany.mockResolvedValue([dbRow()] as never);
    await expect(getRuntimeProfile("pixelspor")).rejects.toMatchObject({ code: "unknown_handle" });
    expect(await isKnownAccountHandleDb("pixelspor")).toBe(false);
    await expect(assertKnownAccountHandleDb("pixelspor")).rejects.toBeInstanceOf(AccountProfileError);
  });

  it("devre dışı hesap fail-closed: inactive (isKnown da false)", async () => {
    mockFindMany.mockResolvedValue([dbRow({ isActive: false })] as never);
    await expect(getRuntimeProfile("grafikcem")).rejects.toMatchObject({ code: "inactive" });
    expect(await isKnownAccountHandleDb("grafikcem")).toBe(false);
  });

  it("draft/incomplete hesap üretime giremez: profile_incomplete", async () => {
    mockFindMany.mockResolvedValue([dbRow({ profileStatus: "draft" })] as never);
    await expect(
      getRuntimeProfile("grafikcem", { requireGenerationReady: true })
    ).rejects.toMatchObject({ code: "profile_incomplete" });
    // üretim-gerektirmeyen okuma (örn. scoring) yine çalışır
    const p = await getRuntimeProfile("grafikcem");
    expect(p.profileStatus).toBe("draft");
  });

  it("bozuk profil JSON'u: profile_invalid (sessiz düşüş yok)", async () => {
    mockFindMany.mockResolvedValue([dbRow({ formatsJson: "bozuk json" })] as never);
    await expect(getRuntimeProfile("grafikcem")).rejects.toMatchObject({ code: "profile_invalid" });
  });

  it("StyleProfile satırı olmayan hesap: profile_incomplete", async () => {
    mockFindMany.mockResolvedValue([dbRow({ styleProfile: null })] as never);
    await expect(getRuntimeProfile("grafikcem")).rejects.toMatchObject({
      code: "profile_incomplete",
    });
  });

  it("aktif yeni hesap dinamik listede görünür; draft/invalid üretim listesine GİRMEZ", async () => {
    mockFindMany.mockResolvedValue([
      dbRow(),
      dbRow({ handle: "pixelspor", displayName: "PixelSpor", profileStatus: "active" }),
      dbRow({ handle: "draftacc", profileStatus: "draft" }),
      dbRow({ handle: "brokenacc", formatsJson: "not json" }),
    ] as never);
    const entries = await listAccountEntries();
    expect(entries.map((e) => e.handle)).toEqual(["grafikcem", "pixelspor", "draftacc", "brokenacc"]);
    const { handles } = await listGenerationReadyHandles();
    expect(handles).toEqual(["grafikcem", "pixelspor"]);
  });

  it("cron seçimi: tek-hesap parametresi de üretim-hazır listeden doğrulanır", async () => {
    mockFindMany.mockResolvedValue([dbRow(), dbRow({ handle: "draftacc", profileStatus: "draft" })] as never);
    expect((await resolveCronHandles(null)).handles).toEqual(["grafikcem"]);
    expect((await resolveCronHandles("grafikcem")).handles).toEqual(["grafikcem"]);
    // draft hesap manuel parametreyle de cron'a sokulamaz
    expect((await resolveCronHandles("draftacc")).handles).toEqual([]);
    expect((await resolveCronHandles("hacker")).handles).toEqual([]);
  });

  it("DB bağlantı hatası: tohumlu hesap işaretli bootstrap fallback'i, bilinmeyen handle db_unavailable", async () => {
    mockFindMany.mockRejectedValue(new Error("P1001: Can't reach database server"));
    const p = await getRuntimeProfile("grafikcem");
    expect(p.degraded).toBe(true); // sessiz değil — işaretli
    await expect(getRuntimeProfile("pixelspor")).rejects.toMatchObject({ code: "db_unavailable" });
    // güvenlik guard'ı: tohumlu true, bilinmeyen THROW (yetki VERMEZ)
    expect(await isKnownAccountHandleDb("grafikcem")).toBe(true);
    await expect(isKnownAccountHandleDb("pixelspor")).rejects.toMatchObject({
      code: "db_unavailable",
    });
    // liste de degraded işaretiyle döner
    const entries = await listAccountEntries();
    expect(entries.every((e) => e.degraded)).toBe(true);
  });

  it("bağlantı-dışı DB hataları yutulmaz (rethrow)", async () => {
    mockFindMany.mockRejectedValue(new Error("column does not exist"));
    await expect(getRuntimeProfile("grafikcem")).rejects.toThrow("column does not exist");
  });
});
