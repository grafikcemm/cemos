import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { healthService } from "@/lib/services/healthService";
import { healthContractService } from "@/lib/health/healthContractService";
import { __resetDbCircuitForTests } from "@/lib/db/dbCircuit";
import { DB_UNAVAILABLE_MESSAGE } from "@/lib/db/dbUnavailableError";

vi.mock("@/lib/services/healthService", () => ({
  healthService: { getHealth: vi.fn() },
}));
vi.mock("@/lib/health/healthContractService", () => ({
  healthContractService: { getContracts: vi.fn() },
}));

const makeReq = (url = "http://localhost:3000/api/health") => new Request(url);

describe("GET /api/health — WP-01 degraded contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDbCircuitForTests();
    vi.mocked(healthContractService.getContracts).mockResolvedValue(null as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with health + contracts on the happy path", async () => {
    vi.mocked(healthService.getHealth).mockResolvedValue({
      degraded: false,
      database: { ok: true, message: "Veritabanı bağlantısı aktif." },
    } as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ degraded: false, contracts: null });
  });

  it("returns 200 + degraded (NOT 5xx) when getHealth itself throws a DB-unavailable error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(healthService.getHealth).mockRejectedValue(
      Object.assign(new Error("Can't reach database server at `ep-x.neon.tech:5432`"), {
        name: "PrismaClientInitializationError",
      }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(200); // health 503/500 döngüsü YARATMAZ
    const json = await res.json();
    expect(json).toMatchObject({
      degraded: true,
      database: { ok: false, message: DB_UNAVAILABLE_MESSAGE },
      contracts: null,
    });
    expect(json.dbCircuit).toBeDefined();
    expect(JSON.stringify(json)).not.toContain("neon.tech");
  });

  it("keeps returning 500 for genuinely unexpected non-DB errors", async () => {
    vi.mocked(healthService.getHealth).mockRejectedValue(new Error("boom"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it("passes deep=true through to healthService", async () => {
    vi.mocked(healthService.getHealth).mockResolvedValue({ degraded: false } as never);
    await GET(makeReq("http://localhost:3000/api/health?deep=true"));
    expect(healthService.getHealth).toHaveBeenCalledWith({ deep: true });
  });
});
