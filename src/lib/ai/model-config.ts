export type ModelRole = "cheapWriter" | "qualityJudge" | "premiumCreative" | "creativeWriter" | "viralJudge" | "finalEditor";

export type ModelConfig = {
  role: ModelRole;
  label: string;
  envKey: string;
  defaultModel: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  enabledByDefault: boolean;
  usageRule: string;
};

export const modelConfigs: Record<ModelRole, ModelConfig> = {
  cheapWriter: {
    role: "cheapWriter",
    label: "Ucuz uretici",
    envKey: "OPENROUTER_CHEAP_MODEL",
    defaultModel: "deepseek/deepseek-v4-flash",
    // operator_quality -> gemini-3.1-flash-lite fiyatlandirmasi (per M token)
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.5,
    enabledByDefault: true,
    usageRule: "Hizli taslak uretimi ve ilk analiz.",
  },
  creativeWriter: {
    role: "creativeWriter",
    label: "Yaratici yazar",
    envKey: "OPENROUTER_CREATIVE_MODEL",
    defaultModel: "deepseek/deepseek-v4-flash",
    // operator_quality -> gemini-3.5-flash fiyatlandirmasi (per M token)
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 9,
    enabledByDefault: true,
    usageRule: "Cok acili taslak uretimi; farkli hook tipleri ve yaklasimlar.",
  },
  viralJudge: {
    role: "viralJudge",
    label: "Viral derecelendirici",
    envKey: "OPENROUTER_JUDGE_MODEL",
    defaultModel: "deepseek/deepseek-v4-flash",
    // operator_quality -> gemini-3.1-flash-lite fiyatlandirmasi (per M token)
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.5,
    enabledByDefault: true,
    usageRule: "Tum taslaklar icin viral skor, hesap uyumu, hook gucu, Turkce dogallik ve risk puani.",
  },
  qualityJudge: {
    role: "qualityJudge",
    label: "Kalite ve risk denetcisi",
    envKey: "OPENROUTER_JUDGE_MODEL",
    defaultModel: "deepseek/deepseek-v4-flash",
    // operator_quality -> gemini-3.5-flash fiyatlandirmasi (per M token)
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 9,
    enabledByDefault: true,
    usageRule: "Yayin oncesi son karar, riskli iddia kontrolu ve final secim.",
  },
  finalEditor: {
    role: "finalEditor",
    label: "Final editor",
    envKey: "OPENROUTER_EDITOR_MODEL",
    defaultModel: "deepseek/deepseek-v4-flash",
    // operator_quality -> claude-sonnet-5 fiyatlandirmasi (per M token)
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
    enabledByDefault: false,
    usageRule: "En iyi adaylari Turkce yazim kurallariyla cilalar. ENABLE_FINAL_EDITOR=true ile aktif.",
  },
  premiumCreative: {
    role: "premiumCreative",
    label: "Premium yaratici yedek",
    envKey: "OPENROUTER_PREMIUM_MODEL",
    defaultModel: "anthropic/claude-sonnet-5",
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
    enabledByDefault: false,
    usageRule: "Sadece kalite dusukse veya kritik postlarda final rewrite.",
  },
};

export function resolveModel(role: ModelRole): string {
  const config = modelConfigs[role];
  const envOverride = process.env[config.envKey];
  const profile = process.env.MODEL_PROFILE || "operator_quality";
  const enableFree = process.env.ENABLE_FREE_MODELS === "true";

  if (envOverride) {
    const isFree = envOverride.includes(":free");
    if (!isFree || enableFree || profile === "dev") {
      return envOverride;
    }
  }

  if (profile === "premium") {
    if (role === "cheapWriter" || role === "creativeWriter" || role === "finalEditor") {
      return "openai/gpt-5.4-mini";
    }
    if (role === "premiumCreative") {
      return "anthropic/claude-sonnet-5";
    }
    return "openai/gpt-5.5";
  }

  if (profile === "operator_quality") {
    // Pinned 2026-07 slug map (FINAL-OPENROUTER-ROUTING §1). Sıcak yollar
    // (writer/judge/news-extract) preset katmanından geçer; burası preset'siz
    // eski çağrıların rol-bazlı default'u.
    if (role === "creativeWriter") {
      return "google/gemini-3.5-flash";
    }
    if (role === "finalEditor") {
      return "anthropic/claude-sonnet-5";
    }
    if (role === "cheapWriter" || role === "viralJudge") {
      return "google/gemini-3.1-flash-lite";
    }
    if (role === "qualityJudge") {
      return "google/gemini-3.5-flash";
    }
    if (role === "premiumCreative") {
      return "anthropic/claude-sonnet-5";
    }
  }

  if (role === "premiumCreative" && process.env.ENABLE_PREMIUM_MODEL !== "true") {
    return resolveModel("qualityJudge");
  }
  return config.defaultModel;
}

export function estimateCost(inputTokens: number, outputTokens: number, role: ModelRole) {
  const config = modelConfigs[role];
  return (
    (inputTokens / 1_000_000) * config.inputCostPerMillion +
    (outputTokens / 1_000_000) * config.outputCostPerMillion
  );
}

export type JudgeMode = "always" | "risk_based" | "off";

export function getJudgeMode(accountHandle: string): JudgeMode {
  const key = `JUDGE_MODE_${accountHandle.toUpperCase()}`;
  const val = process.env[key] ?? process.env.ENABLE_JUDGE ?? "always";
  if (val === "risk_based" || val === "off") return val;
  return "always";
}
