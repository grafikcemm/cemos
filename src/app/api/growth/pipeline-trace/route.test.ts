import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { pipelineTraceRepo } from "@/lib/db/pipelineTraceRepo";

vi.mock("@/lib/db/pipelineTraceRepo", () => ({
  pipelineTraceRepo: { listBySubject: vi.fn() },
}));

function makeReq(query: string) {
  return new NextRequest(`http://localhost:3000/api/growth/pipeline-trace${query}`);
}

describe("/api/growth/pipeline-trace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns traces for a valid subject", async () => {
    vi.mocked(pipelineTraceRepo.listBySubject).mockResolvedValue([{ id: "pt1", stages: [] }] as never);
    const res = await GET(makeReq("?subjectType=yt_video&subjectId=v1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.traces).toHaveLength(1);
    expect(pipelineTraceRepo.listBySubject).toHaveBeenCalledWith("yt_video", "v1", 20);
  });

  it("returns 400 when subjectId is missing", async () => {
    const res = await GET(makeReq("?subjectType=yt_video"));
    expect(res.status).toBe(400);
    expect(pipelineTraceRepo.listBySubject).not.toHaveBeenCalled();
  });

  it("retries once on a transient error then succeeds", async () => {
    vi.mocked(pipelineTraceRepo.listBySubject)
      .mockRejectedValueOnce(new Error("Can't reach database"))
      .mockResolvedValueOnce([] as never);
    const res = await GET(makeReq("?subjectType=ig_comment&subjectId=c1&limit=5"));
    expect(res.status).toBe(200);
    expect(pipelineTraceRepo.listBySubject).toHaveBeenCalledTimes(2);
    expect(pipelineTraceRepo.listBySubject).toHaveBeenLastCalledWith("ig_comment", "c1", 5);
  });
});
