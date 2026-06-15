import type { AccountProfile } from "@/lib/accounts";
import type { BenchmarkResult } from "@/lib/ai/prompts";
import { runDraftPipeline } from "@/lib/ai/draft-pipeline";

export async function runAccountBenchmark(profile: AccountProfile): Promise<BenchmarkResult> {
  return runDraftPipeline(profile, profile.benchmarkInput);
}
