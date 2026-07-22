/**
 * CemOS Learn — doğrulanmış LLM aşaması. createPipelineTrace.runStage'i Zod
 * safeParse + tek repair pass ile sarar. openrouter.ts çıktıyı doğrulamaz; bu
 * helper her stage çıktısını şemaya zorlar. İki kez başarısız → throw (orchestrator
 * yakalar, aşama retry/fail eder). Şema üzerinden generic → .default()/.refine()
 * içeren şemalar (input≠output) sorunsuz geçer.
 */

import { z, type ZodTypeAny } from "zod";
import type { ModelRole } from "@/lib/ai/model-config";
import type { PipelineTraceCollector } from "@/lib/agents/pipeline-runner";

export class StageValidationError extends Error {
  readonly code = "stage_validation";
  constructor(stage: string, detail: string) {
    super(`Aşama "${stage}" şema doğrulamasından geçmedi: ${detail}`);
    this.name = "StageValidationError";
  }
}

export type SpendFn = (r: { actualCostUsd: number; model: string }) => Promise<void>;

export type RunValidatedOptions<S extends ZodTypeAny> = {
  stage: string;
  role: ModelRole;
  roleFallback?: ModelRole[];
  system: string;
  user: string;
  schema: S;
  temperature?: number;
  onSpend: SpendFn;
};

export async function runValidatedStage<S extends ZodTypeAny>(
  trace: PipelineTraceCollector,
  opts: RunValidatedOptions<S>
): Promise<{ data: z.infer<S>; model: string }> {
  const first = await trace.runStage<unknown>({
    stage: opts.stage,
    role: opts.role,
    roleFallback: opts.roleFallback,
    system: opts.system,
    user: opts.user,
    temperature: opts.temperature,
  });
  await opts.onSpend(first);

  const parsed = opts.schema.safeParse(first.data);
  if (parsed.success) return { data: parsed.data, model: first.model };

  // Repair pass: hatayı prompt'a ekle, bir kez daha dene.
  const errDetail = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  const repairUser =
    `${opts.user}\n\nÖNCEKİ ÇIKTIN GEÇERSİZDİ. Şema hataları: ${errDetail}\n` +
    `SADECE şemaya UYAN geçerli JSON döndür, başka hiçbir metin ekleme.`;

  const second = await trace.runStage<unknown>({
    stage: `${opts.stage}_repair`,
    role: opts.role,
    roleFallback: opts.roleFallback,
    system: opts.system,
    user: repairUser,
    temperature: 0.2,
  });
  await opts.onSpend(second);

  const parsed2 = opts.schema.safeParse(second.data);
  if (parsed2.success) return { data: parsed2.data, model: second.model };

  throw new StageValidationError(opts.stage, errDetail);
}
