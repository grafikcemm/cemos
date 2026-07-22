import { describe, it, expect } from "vitest";
import { deriveLearnState } from "./status";

function d(over: Partial<Parameters<typeof deriveLearnState>[0]> = {}) {
  return deriveLearnState({
    sourceStatus: "processing",
    jobStatus: "running",
    jobStage: "content_analysis",
    jobError: null,
    packStatus: null,
    ...over,
  });
}

describe("deriveLearnState (4C-E canonical status)", () => {
  it("bütçe engeli genel hata DEĞİL → budget_blocked", () => {
    expect(d({ jobStatus: "pending", jobError: "budget" }).state).toBe("budget_blocked");
  });

  it("transkript yok → transcript_required + manuel yol açık (kaybolmaz)", () => {
    const s = d({ sourceStatus: "failed", jobStatus: "failed", jobError: "transcript_unavailable" });
    expect(s.state).toBe("transcript_required");
    expect(s.needsManualTranscript).toBe(true);
    expect(s.canAdvance).toBe(true);
  });

  it("job failed (başka hata) → failed", () => {
    expect(d({ jobStatus: "failed", jobError: "stage_validation" }).state).toBe("failed");
  });

  it("pack qa_failed → failed (source ready OLAMAZ, hazır değil)", () => {
    expect(d({ jobStatus: "done", packStatus: "qa_failed" }).state).toBe("failed");
  });

  it("pack qa_pending → needs_review (Hazır bilgi DEĞİL)", () => {
    expect(d({ jobStatus: "done", packStatus: "qa_pending" }).state).toBe("needs_review");
  });

  it("ready YALNIZ pack ready + job done", () => {
    expect(d({ jobStatus: "done", packStatus: "ready" }).state).toBe("ready");
    // pack ready ama job daha bitmedi → henüz ready değil (review_schedule geçilmedi olabilir)
    expect(d({ jobStatus: "running", packStatus: "ready" }).state).toBe("processing");
  });

  it("job pending/running → processing", () => {
    expect(d({ jobStatus: "running", packStatus: null }).state).toBe("processing");
    expect(d({ jobStatus: "pending", packStatus: null }).state).toBe("processing");
  });

  it("henüz job yok + source new → inbox", () => {
    expect(d({ sourceStatus: "new", jobStatus: null, jobError: null, packStatus: null }).state).toBe(
      "inbox"
    );
  });

  it("ready + failed → canAdvance false; diğerleri true", () => {
    expect(d({ jobStatus: "done", packStatus: "ready" }).canAdvance).toBe(false);
    expect(d({ jobStatus: "failed", jobError: "x" }).canAdvance).toBe(false);
    expect(d({ jobStatus: "running" }).canAdvance).toBe(true);
  });
});
