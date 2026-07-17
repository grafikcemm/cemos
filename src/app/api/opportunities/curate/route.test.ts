import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/opportunities/curate (ADR-034 §E) — guard/bound/dürüst-etiket
 * sözleşmesi. Trace repo mock; LLM kapısı kapalı → deterministik yol gerçek
 * koşar ve response ASLA "agent" iddia etmez.
 */

const traceCreate = vi.fn().mockResolvedValue({ id: "trace-1" });
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: (i: unknown) => traceCreate(i) },
}));

const GOOD_LLM_RESPONSE = {
  data: {
    selections: [
      {
        sourceId: "news-1",
        score: 90,
        reasons: {
          personaFit: "uyumlu",
          freshness: "taze",
          sourceDiversity: "çeşitli",
          concreteness: "somut",
          risk: "düşük",
        },
      },
    ],
  },
  model: "mock/model",
  actualCostUsd: 0.001,
};

const gatedSpy = vi.fn();
let gatedResponse: unknown = GOOD_LLM_RESPONSE;
vi.mock("@/lib/ai/generateGated", () => ({
  generateJsonGated: (...a: unknown[]) => {
    gatedSpy(...a);
    return Promise.resolve(gatedResponse);
  },
}));

import { POST } from "./route";

const CANDIDATES = [
  {
    id: "news-1",
    source: "news",
    title: "Aday 1",
    whyNow: "taze",
    badge: "buzz 80",
    buzz: 80,
    ageHours: 2,
    personaFit: 0.8,
    suggestedPlatform: "X",
    topicSeed: "konu",
    rawTab: "news-pool",
  },
  {
    id: "yt-1",
    source: "youtube",
    title: "Aday 2",
    whyNow: "ivme",
    badge: "×3",
    multiplier: 3,
    ageHours: 10,
    personaFit: 0.6,
    suggestedPlatform: "YouTube",
    topicSeed: "video",
    rawTab: "youtube",
  },
];

function req(body: unknown, opts?: { origin?: boolean; raw?: string }): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.origin !== false) headers["Sec-Fetch-Site"] = "same-origin";
  return new NextRequest("http://localhost:3000/api/opportunities/curate", {
    method: "POST",
    headers,
    body: opts?.raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gatedResponse = GOOD_LLM_RESPONSE;
  delete process.env.ENABLE_AGENT_CURATION;
  delete process.env.OPENROUTER_KEY_ROTATED_AT;
});

describe("POST /api/opportunities/curate (ADR-034 §E)", () => {
  it("same-origin değilse 403 (LLM bütçesi dışarıdan harcanamaz)", async () => {
    const res = await POST(req({ candidates: CANDIDATES }, { origin: false }));
    expect(res.status).toBe(403);
  });

  it("geçersiz JSON → 400", async () => {
    const res = await POST(req(null, { raw: "{bozuk" }));
    expect(res.status).toBe(400);
  });

  it("şema-dışı girdi (candidates yok) → 400", async () => {
    const res = await POST(req({ foo: 1 }));
    expect(res.status).toBe(400);
  });

  it("body 256KB'ı aşarsa 413 (bounded input)", async () => {
    const res = await POST(req(null, { raw: "x".repeat(300 * 1024) }));
    expect(res.status).toBe(413);
  });

  it("LLM kapalı → method=deterministic + fallbackReason; 'agent' İDDİA EDİLMEZ", async () => {
    const res = await POST(req({ candidates: CANDIDATES, limit: 8, perSourceCap: 4 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.method).toBe("deterministic");
    expect(json.fallbackReason).toBeTruthy();
    expect(gatedSpy).not.toHaveBeenCalled();
    // Source ID binding: her seçim girdi adaylarından.
    const validIds = new Set(CANDIDATES.map((c) => c.id));
    for (const s of json.selections) expect(validIds.has(s.sourceId)).toBe(true);
  });

  it("rotasyon marker'ı yokken ENABLE_AGENT_CURATION=1 bile deterministic (fallbackReason=openrouter_key_not_rotated)", async () => {
    process.env.ENABLE_AGENT_CURATION = "1";
    const res = await POST(req({ candidates: CANDIDATES }));
    const json = await res.json();
    expect(json.method).toBe("deterministic");
    expect(json.fallbackReason).toBe("openrouter_key_not_rotated");
    expect(gatedSpy).not.toHaveBeenCalled();
  });

  it("kapılar açık + model geçerli çıktı → method=agent (gerçek başarı rozeti)", async () => {
    process.env.ENABLE_AGENT_CURATION = "1";
    process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17";
    const res = await POST(req({ candidates: CANDIDATES }));
    const json = await res.json();
    expect(gatedSpy).toHaveBeenCalledTimes(1);
    expect(json.method).toBe("agent");
    expect(json.fallbackReason).toBeNull();
    expect(json.selections[0].sourceId).toBe("news-1");
  });

  it("model uydurma sourceId dönerse fail-closed deterministik fallback (agent etiketi YOK)", async () => {
    process.env.ENABLE_AGENT_CURATION = "1";
    process.env.OPENROUTER_KEY_ROTATED_AT = "2026-07-17";
    gatedResponse = {
      data: {
        selections: [
          {
            sourceId: "HAYALET-99",
            score: 99,
            reasons: { personaFit: "x", freshness: "x", sourceDiversity: "x", concreteness: "x", risk: "x" },
          },
        ],
      },
      model: "mock/model",
      actualCostUsd: 0.001,
    };
    const res = await POST(req({ candidates: CANDIDATES }));
    const json = await res.json();
    expect(json.method).toBe("deterministic");
    const validIds = new Set(CANDIDATES.map((c) => c.id));
    expect(json.selections.length).toBeGreaterThan(0);
    for (const s of json.selections) expect(validIds.has(s.sourceId)).toBe(true);
  });
});
