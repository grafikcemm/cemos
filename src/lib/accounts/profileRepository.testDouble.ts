import { vi } from "vitest";

/**
 * Test double (ADR-031): DB-otoriteli profileRepository'nin deterministik,
 * ağ'sız sahtesi. Tohumlu iki hesabı "aktif + üretim-hazır" kabul eder;
 * bilinmeyen handle fail-closed davranışını birebir taklit eder.
 *
 * Kullanım (vitest hoisting-uyumlu):
 *   vi.mock("@/lib/accounts/profileRepository", () =>
 *     import("@/lib/accounts/profileRepository.testDouble").then((m) =>
 *       m.createProfileRepositoryTestDouble()
 *     )
 *   );
 */
export async function createProfileRepositoryTestDouble() {
  const { accountProfiles } = await import("@/lib/accounts");

  class AccountProfileError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "AccountProfileError";
      this.code = code;
    }
  }

  const known = (h: string) => h in accountProfiles;
  const handles = () => Object.keys(accountProfiles);

  const toRuntime = (h: string) => {
    const p = accountProfiles[h as keyof typeof accountProfiles];
    if (!p) throw new AccountProfileError("unknown_handle", `Bilinmeyen hesap handle'ı: ${h}`);
    return {
      ...p,
      displayName: p.handle,
      platform: "x",
      profileStatus: "active",
      isActive: true,
      profileVersion: 1,
      degraded: false,
    };
  };

  return {
    AccountProfileError,
    invalidateAccountProfileCache: vi.fn(),
    isKnownAccountHandleDb: vi.fn(async (h: string) => known(h)),
    assertKnownAccountHandleDb: vi.fn(async (h: string) => {
      if (!known(h)) throw new AccountProfileError("unknown_handle", `Bilinmeyen hesap handle'ı: ${h}`);
      return h;
    }),
    getRuntimeProfile: vi.fn(async (h: string) => toRuntime(h)),
    listAccountEntries: vi.fn(async () =>
      handles().map((h) => ({
        handle: h,
        displayName: h,
        profileStatus: "active",
        isActive: true,
        platform: "x",
        profileValid: true,
        degraded: false,
      }))
    ),
    listGenerationReadyHandles: vi.fn(async () => ({ handles: handles(), degraded: false })),
    resolveCronHandles: vi.fn(async (handleParam: string | null) => ({
      handles: handleParam ? handles().filter((h) => h === handleParam) : handles(),
      degraded: false,
    })),
    rowToRuntimeProfile: vi.fn(),
    bootstrapRuntimeProfile: vi.fn(),
    RuntimeAccountProfileSchema: (await import("zod")).z.any(),
    AccountModeSchema: (await import("zod")).z.any(),
  };
}
