import { runDeterministicHeuristics, type LintIssue } from "../safety/heuristics";
import { generateJson } from "../ai/openrouter";

export type LintSeverity = "blocker" | "warning";

export type LintReport = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  issues: LintIssue[];
  cleanedText?: string | null;
  checkedAt: string;
  source: {
    deterministic: boolean;
    llm: boolean;
  };
};

type LLMJudgeResponse = {
  blockers: string[];
  warnings: string[];
  cleanedText: string | null;
};

export type LintOptions = {
  forceDeterministicOnly?: boolean;
  accountHandle?: string;
  sourceText?: string;
  /** Format-tier lower bound; content below this is flagged (warning, not blocker). */
  minChars?: number;
};

export const qualityLintService = {
  async lint(
    text: string,
    draftType: string = "TWEET",
    maxChars: number = 280,
    options?: LintOptions
  ): Promise<LintReport> {
    const checkedAt = new Date().toISOString();

    // 1. Run deterministic heuristics
    const heuristicResult = runDeterministicHeuristics(text, draftType, maxChars, options?.accountHandle, options?.sourceText, options?.minChars);
    
    const blockers = heuristicResult.issues
      .filter((i) => i.severity === "blocker")
      .map((i) => i.message);
      
    const warnings = heuristicResult.issues
      .filter((i) => i.severity === "warning")
      .map((i) => i.message);

    const report: LintReport = {
      passed: heuristicResult.passed,
      blockers,
      warnings,
      issues: heuristicResult.issues,
      cleanedText: null,
      checkedAt,
      source: {
        deterministic: true,
        llm: false,
      },
    };

    const enableLlmLint = process.env.ENABLE_LLM_LINT ?? "risk_based";

    if (
      options?.forceDeterministicOnly ||
      enableLlmLint === "false"
    ) {
      return report;
    }

    if (enableLlmLint === "risk_based") {
      // Risk-based: Only run LLM judge if there is a deterministic warning or blocker issue
      if (heuristicResult.issues.length === 0) {
        return report;
      }
    }

    // If deterministic blocker is severe (e.g. empty content or limit exceeded), skip LLM
    const hasSevereBlocker = heuristicResult.issues.some(
      (i) => i.code === "empty_text" || i.code === "char_limit"
    );

    const apiKey = process.env.OPENROUTER_API_KEY;
    const isMockMode = process.env.MOCK_BENCHMARK === "true" || !apiKey;

    if (hasSevereBlocker || isMockMode) {
      return report;
    }

    // 2. LLM Judge Micro-Pass
    try {
      const systemPrompt = [
        "Sen Türkçe X tweetlerinin yayın editörüsün. Taslağı sadece şu açılardan incele:",
        "1. anlatım bozukluğu veya yarım cümle",
        "2. bozuk Türkçe, yazım veya harf hatası",
        "3. fazla satış kokusu",
        "4. spam kokusu",
        "5. uygunsuz mention/link",
        "6. kaynak olmadan kesin haber/transfer iddiası",
        "",
        "JSON döndür:",
        "{",
        '  "blockers": string[],',
        '  "warnings": string[],',
        '  "cleanedText": string | null',
        "}",
        "",
        "cleanedText yalnızca küçük yazım ve noktalama düzeltmeleri içerebilir. Anlam, iddia, ton ve içerik değişmesin."
      ].join("\n");

      const userPrompt = `Aşağıdaki taslağı incele:\n\n"${text}"`;

      const response = await generateJson<LLMJudgeResponse>({
        role: "qualityJudge",
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.1,
      });

      const llmData = response.data;
      report.source.llm = true;

      if (llmData.blockers && Array.isArray(llmData.blockers)) {
        for (const b of llmData.blockers) {
          if (b.trim()) {
            report.blockers.push(b);
            report.issues.push({
              code: "llm_blocker",
              severity: "blocker",
              message: b,
            });
          }
        }
      }

      if (llmData.warnings && Array.isArray(llmData.warnings)) {
        for (const w of llmData.warnings) {
          if (w.trim()) {
            report.warnings.push(w);
            report.issues.push({
              code: "llm_warning",
              severity: "warning",
              message: w,
            });
          }
        }
      }

      if (llmData.cleanedText && typeof llmData.cleanedText === "string") {
        // Run simple heuristic check on cleanedText to ensure it didn't introduce new blockers
        const cleanHeuristic = runDeterministicHeuristics(llmData.cleanedText, draftType, maxChars);
        if (cleanHeuristic.passed) {
          report.cleanedText = llmData.cleanedText;
        }
      }

      // Re-evaluate passed based on new blockers
      report.passed = !report.issues.some((issue) => issue.severity === "blocker");

    } catch (err) {
      // If judge fails, log and fallback without breaking the generation flow
      report.warnings.push("LLM Judge kontrolü yapılamadı, yalnızca deterministik kurallar uygulandı.");
      report.issues.push({
        code: "llm_judge_failed",
        severity: "warning",
        message: err instanceof Error ? err.message : "LLM Judge connection error",
      });
    }

    return report;
  },
};
