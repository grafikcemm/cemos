import { describe, it, expect, vi, beforeEach } from "vitest";

// Dalga 2 (Sprint 2): runStage artık budget-gated çağrı kullanır.
vi.mock("@/lib/ai/generateGated", () => ({ generateJsonGated: vi.fn() }));
vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { create: vi.fn(() => Promise.resolve({ id: "pt-1" })) },
}));

import { generateJsonGated } from "@/lib/ai/generateGated";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";
import { createPipelineTrace } from "@/lib/agents/pipeline-runner";

const META = { platform: "youtube", pipelineId: "yt_brief", subjectType: "yt_video", subjectId: "vid-1" };

function okResult(model = "gpt-x", cost = 0.01) {
  return {
    data: { foo: "bar" },
    model,
    inputTokens: 10,
    outputTokens: 5,
    estimatedCostUsd: cost,
    actualCostUsd: cost,
  };
}

describe("createPipelineTrace.runStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs a stage 1:1, returns the result, and records an ok trace entry", async () => {
    vi.mocked(generateJsonGated).mockResolvedValue(okResult("m1", 0.02) as never);
    const trace = createPipelineTrace(META);

    const r = await trace.runStage({ stage: "analiz", role: "viralJudge", system: "S", user: "U", temperature: 0.4 });

    expect(r.model).toBe("m1");
    expect(generateJsonGated).toHaveBeenCalledWith({
      role: "viralJudge",
      system: "S",
      user: "U",
      temperature: 0.4,
      purpose: "yt_brief",
      platform: "youtube",
      meta: { stage: "analiz" },
    });
    expect(trace.stages).toHaveLength(1);
    expect(trace.stages[0]).toMatchObject({
      stage: "analiz",
      role: "viralJudge",
      model: "m1",
      ok: true,
      failOpenUsed: false,
      costUsd: 0.02,
    });
  });

  it("falls back to the next role and records ONE stage with failOpenUsed", async () => {
    vi.mocked(generateJsonGated)
      .mockRejectedValueOnce(new Error("premium down"))
      .mockResolvedValueOnce(okResult("m2", 0.03) as never);
    const trace = createPipelineTrace(META);

    const r = await trace.runStage({
      stage: "tammetin",
      role: "premiumCreative",
      roleFallback: ["creativeWriter"],
      system: "S",
      user: "U",
    });

    expect(r.model).toBe("m2");
    expect(generateJsonGated).toHaveBeenCalledTimes(2);
    expect(trace.stages).toHaveLength(1);
    expect(trace.stages[0]).toMatchObject({ role: "creativeWriter", model: "m2", ok: true, failOpenUsed: true });
  });

  it("records an ok:false stage and rethrows when every role fails", async () => {
    vi.mocked(generateJsonGated).mockRejectedValue(new Error("down"));
    const trace = createPipelineTrace(META);

    await expect(
      trace.runStage({ stage: "analiz", role: "viralJudge", system: "S", user: "U" })
    ).rejects.toThrow("down");
    expect(trace.stages).toHaveLength(1);
    expect(trace.stages[0]).toMatchObject({ ok: false, failOpenUsed: true, model: "" });
  });

  it("flush writes the accumulated trace with meta + totalCost", async () => {
    vi.mocked(generateJsonGated).mockResolvedValue(okResult("m1", 0.05) as never);
    const trace = createPipelineTrace(META);
    await trace.runStage({ stage: "s1", role: "cheapWriter", system: "S", user: "U" });

    await trace.flush(0.05);

    expect(pipelineTraceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "youtube",
        pipelineId: "yt_brief",
        subjectType: "yt_video",
        subjectId: "vid-1",
        totalCostUsd: 0.05,
      })
    );
    const arg = vi.mocked(pipelineTraceRepo.create).mock.calls[0][0];
    expect(arg.stages).toHaveLength(1);
  });

  it("flush swallows a trace-write failure (never blocks production)", async () => {
    vi.mocked(generateJsonGated).mockResolvedValue(okResult() as never);
    vi.mocked(pipelineTraceRepo.create).mockRejectedValue(new Error("db down"));
    const trace = createPipelineTrace(META);
    await trace.runStage({ stage: "s1", role: "cheapWriter", system: "S", user: "U" });

    await expect(trace.flush(0.01)).resolves.toBeUndefined();
  });

  it("flush is a no-op when no stages ran", async () => {
    const trace = createPipelineTrace(META);
    await trace.flush(0);
    expect(pipelineTraceRepo.create).not.toHaveBeenCalled();
  });
});
