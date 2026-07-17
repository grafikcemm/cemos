import type { z } from "zod";
import type { PresetName } from "@/lib/ai/presets";
import type { AiBudgetClass } from "@/lib/config/costGate";
import type { MemoryProvenance } from "@/lib/memory/memoryFactService";

/**
 * Config-driven agent/skill registry — TİP SÖZLEŞMESİ (ADR-027, Faz 2A).
 *
 * Ayrım bağlayıcıdır:
 *  - AgentDefinition = DEKLARATİF metadata (id/amaç/izin/şema/politika). Yalnız
 *    veri; çalıştırılabilir fonksiyon, prompt gövdesi veya secret TAŞIMAZ —
 *    client'a sızsa bile zarar veremez (yine de client'a gönderilmez).
 *  - AgentAdapter = SERVER-SIDE çalıştırılabilir köprü. Mevcut servisleri sarar;
 *    yeni agent yazmaz. adapters.ts dışında adapter tanımlanamaz (allowlist).
 *  - Keyfî dynamic import / tool çalıştırma YOK: her adapter'ın delegasyonu
 *    sabit, literal modül yoludur.
 */

/** Kapalı capability allowlist'i — tanımsız capability registry doğrulamasında düşer. */
export const AGENT_CAPABILITIES = [
  "db:read",
  "db:write:queue",
  "db:write:plan",
  "db:write:handoff",
  "db:write:learn",
  "llm:generate",
  "memory:read",
  "memory:write:episodic",
  "memory:write:identity",
  "net:verify_website",
  "net:meta_graph",
  "net:youtube",
  "net:social_sources",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

/** Hafıza katmanları (02-AGENT-MEMORY §2 ile hizalı). */
export const MEMORY_SCOPES = [
  "identity",
  "account",
  "style",
  "series",
  "episodic",
  "performance",
  "knowledge",
  "negative",
] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export type AgentExecutionMode = "deterministic" | "llm" | "hybrid";

export type AgentEntryStatus = "enabled" | "blocked_external" | "disabled";

export type AgentRetryPolicy = {
  /** Yalnız failed_execution için; validation/budget hatası retry edilmez. 0–2. */
  maxAttempts: number;
};

export type AgentFallbackPolicy =
  | { kind: "none" }
  | { kind: "deterministic"; note: string };

export type AgentTracePolicy = "always" | "on_llm";

export type AgentDefinition = {
  /** Registry-benzersiz kebab-case id. */
  id: string;
  /** Tanım sürümü (davranış değişince artar). */
  version: string;
  /** Karar politikası sürümü (trace'e yazılır). */
  policyVersion: string;
  /** Ürün rol adı (Türkçe görünen ad). */
  displayName: string;
  purpose: string;
  /** Bu agent'ı neyin tetiklediği (cron/UI eylemi/başka agent). Belgeleyici. */
  triggers: string[];
  /** adapters.ts içindeki server-side adapter anahtarı. */
  adapterId: string;
  executionMode: AgentExecutionMode;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  allowedCapabilities: AgentCapability[];
  /** llm/hybrid için zorunlu geçerli preset; deterministic için null (model gerektirmez). */
  preset: PresetName | null;
  /** llm/hybrid için zorunlu; deterministic null. */
  budgetClass: AiBudgetClass | null;
  timeoutMs: number;
  retry: AgentRetryPolicy;
  fallback: AgentFallbackPolicy;
  memoryReadScopes: MemoryScope[];
  memoryWriteScopes: MemoryScope[];
  /** Çıktısının provenance sınıfı. "external" identity/memory YAZAMAZ (doğrulama zorlar). */
  provenance: MemoryProvenance;
  tracePolicy: AgentTracePolicy;
  /** fixtures.ts içindeki deterministik fixture id'leri — enabled entry için ≥1 zorunlu. */
  evalFixtureIds: string[];
  status: AgentEntryStatus;
};

/** Adapter çalıştırma bağlamı (executor kurar). */
export type AgentAdapterContext = {
  subjectType: string;
  subjectId: string;
  platform: string;
  accountId?: string;
};

export type AgentAdapterRun = {
  output: unknown;
  /** Deterministik koşu = 0 (açık temsil). Ücretli maliyeti gated primitive UsageLog'a yazar. */
  costUsd: number;
};

export type AgentAdapter = {
  id: string;
  /** Adapter'ın gerçekten kullandığı capability'ler — entry allowlist'inin alt kümesi olmalı. */
  capabilitiesUsed: AgentCapability[];
  /** Adapter'ın gerçekten yazdığı hafıza scope'ları — entry memoryWriteScopes alt kümesi. */
  memoryWritesUsed: MemoryScope[];
  run(input: unknown, ctx: AgentAdapterContext): Promise<AgentAdapterRun>;
  /**
   * LLM yolu bütçe/kredi engeline takıldığında veya output doğrulaması
   * düştüğünde çalıştırılacak deterministik yol. Varsa sonuç
   * `deterministic_fallback` + fallbackUsed=true olarak işaretlenir — sahte
   * "AI sonucu" ASLA üretilmez.
   */
  runDeterministicFallback?(input: unknown, ctx: AgentAdapterContext): Promise<AgentAdapterRun>;
};

export type AgentRunStatus =
  | "succeeded"
  | "deterministic_fallback"
  | "blocked_external"
  | "failed_validation"
  | "failed_execution"
  | "timed_out";

/**
 * Faz 2E (ADR-034): trace yazımının GÖZLENEN sonucu. Bu, koşu-bazlı dürüst bir
 * sinyaldir — global/durable "kayıp trace sayacı" İDDİASI DEĞİLDİR (ana DB
 * erişilemezken aynı DB'ye "yazamadım" kaydı yazılamaz; process-local sayaç
 * serverless'ta cross-instance toplanamaz).
 */
export type AgentTraceStatus = "persisted" | "failed" | "skipped_policy";

export type AgentRunResult<T = unknown> = {
  agentId: string;
  agentVersion: string;
  adapterId: string;
  status: AgentRunStatus;
  output: T | null;
  /** true ⇒ sonuç deterministik yoldan geldi (LLM sonucu DEĞİL) — UI/trace'te gizlenemez. */
  fallbackUsed: boolean;
  blockedReason?: string;
  errorMessage?: string;
  latencyMs: number;
  retryCount: number;
  costUsd: number;
  /** Bu koşunun trace yazımının gözlenen sonucu (ADR-034). */
  traceStatus: AgentTraceStatus;
};

/**
 * Adapter'ın "dış engel" sinyali (kredi yok / izin yok / entegrasyon kapalı).
 * Executor bunu yakalar: fallback varsa deterministik yola düşer, yoksa
 * blocked_external döner. Sahte başarı üretmez.
 */
export class AgentBlockedError extends Error {
  readonly blockedExternal = true;
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? `Agent dış engel: ${reason}`);
    this.name = "AgentBlockedError";
    this.reason = reason;
  }
}

export class AgentRegistryError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Agent registry doğrulaması başarısız (${problems.length} sorun):\n- ${problems.join("\n- ")}`);
    this.name = "AgentRegistryError";
    this.problems = problems;
  }
}
