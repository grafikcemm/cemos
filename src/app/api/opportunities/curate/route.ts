import { NextRequest, NextResponse } from "next/server";
import { isOperatorOrCronAuthorized } from "@/lib/utils/sameOriginGuard";
import { CuratorInputSchema, runDeterministicCuration } from "@/lib/agents/registry/opportunityCurator";
import { executeAgent } from "@/lib/agents/registry/executor";
import type { CuratorOutput } from "@/lib/agents/registry/opportunityCurator";

export const dynamic = "force-dynamic";

/**
 * Fırsat kürasyonu — server-side orchestrator (ADR-034 §E).
 *
 * LLM istemciden ÇAĞRILMAZ: client ham motor adaylarını buraya gönderir,
 * registry executor opportunity-curator'ı koşar. ENABLE_AGENT_CURATION=1 +
 * rotasyon marker'ı yoksa (veya LLM timeout/invalid-output/budget reject)
 * deterministik yol döner ve response bunu DÜRÜSTÇE etiketler:
 *   method: "agent" | "deterministic" (+ fallbackReason)
 * "agent" YALNIZ gerçek model çağrısı başarıyla doğrulandığında döner —
 * fallback sonucu asla "agent üretti" diye sunulmaz.
 */

const MAX_BODY_CHARS = 256 * 1024;

export async function POST(req: NextRequest) {
  if (!isOperatorOrCronAuthorized(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ success: false, error: "body_too_large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = CuratorInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid_input", detail: parsed.error.issues[0]?.message ?? "?" },
      { status: 400 }
    );
  }

  try {
    const result = await executeAgent<CuratorOutput>("opportunity-curator", parsed.data, {
      subjectType: "opportunity_curation",
      subjectId: new Date().toISOString().slice(0, 10),
    });

    if (result.output) {
      const isRealAgent =
        result.status === "succeeded" && !result.fallbackUsed && result.output.method === "agent";
      return NextResponse.json({
        success: true,
        method: isRealAgent ? "agent" : "deterministic",
        fallbackReason: isRealAgent ? null : (result.blockedReason ?? result.status),
        selections: result.output.selections,
        agentRun: {
          status: result.status,
          traceStatus: result.traceStatus,
          latencyMs: result.latencyMs,
          agentVersion: result.agentVersion,
        },
      });
    }

    // Executor output üretemedi (timeout/failed_execution) → route-seviyesi
    // deterministik fallback; yine dürüst etiketlenir.
    const deterministic = runDeterministicCuration(parsed.data);
    return NextResponse.json({
      success: true,
      method: "deterministic",
      fallbackReason: result.blockedReason ?? result.status,
      selections: deterministic.selections,
      agentRun: {
        status: result.status,
        traceStatus: result.traceStatus,
        latencyMs: result.latencyMs,
        agentVersion: result.agentVersion,
      },
    });
  } catch {
    // Son savunma hattı: kürasyon isteği hiçbir durumda 500 ile Fırsatlar'ı
    // kırmasın — deterministik sonuç dön.
    const deterministic = runDeterministicCuration(parsed.data);
    return NextResponse.json({
      success: true,
      method: "deterministic",
      fallbackReason: "orchestrator_error",
      selections: deterministic.selections,
      agentRun: null,
    });
  }
}
