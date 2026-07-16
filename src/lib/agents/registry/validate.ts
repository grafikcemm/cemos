import { z } from "zod";
import { PRESETS } from "@/lib/ai/presets";
import {
  AGENT_CAPABILITIES,
  AgentRegistryError,
  MEMORY_SCOPES,
  type AgentAdapter,
  type AgentDefinition,
} from "./types";
import { fixtureById } from "./fixtures";

/**
 * Registry fail-fast doğrulaması (ADR-027). Başlangıçta (index.ts import'u)
 * ve testte çalışır; TEK sorun bile AgentRegistryError fırlatır — sakat
 * registry ile üretim koşusu başlayamaz.
 */

const TIMEOUT_MIN_MS = 1_000;
const TIMEOUT_MAX_MS = 600_000;
const RETRY_MAX = 2;

function isZodSchema(v: unknown): boolean {
  return v instanceof z.ZodType;
}

export function collectRegistryProblems(
  definitions: AgentDefinition[],
  adapters: Record<string, AgentAdapter>
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const capSet = new Set<string>(AGENT_CAPABILITIES);
  const scopeSet = new Set<string>(MEMORY_SCOPES);
  const presetNames = new Set(Object.keys(PRESETS));

  for (const def of definitions) {
    const tag = `[${def.id}]`;

    if (seen.has(def.id)) problems.push(`${tag} duplicate id`);
    seen.add(def.id);

    if (def.status === "enabled" && !adapters[def.adapterId]) {
      problems.push(`${tag} aktif entry'nin adapter'ı yok: "${def.adapterId}"`);
    }

    if (!isZodSchema(def.inputSchema)) problems.push(`${tag} inputSchema Zod şeması değil`);
    if (!isZodSchema(def.outputSchema)) problems.push(`${tag} outputSchema Zod şeması değil`);

    if (def.executionMode === "deterministic") {
      if (def.preset !== null) problems.push(`${tag} deterministic entry preset taşıyamaz`);
      if (def.budgetClass !== null) problems.push(`${tag} deterministic entry budgetClass taşıyamaz`);
    } else {
      if (!def.preset || !presetNames.has(def.preset)) {
        problems.push(`${tag} ${def.executionMode} entry geçerli preset gerektirir (verilen: ${String(def.preset)})`);
      }
      if (!def.budgetClass) problems.push(`${tag} ${def.executionMode} entry budgetClass gerektirir`);
      if (!def.allowedCapabilities.includes("llm:generate")) {
        problems.push(`${tag} ${def.executionMode} entry "llm:generate" capability'si olmadan model çağıramaz`);
      }
    }

    if (def.timeoutMs < TIMEOUT_MIN_MS || def.timeoutMs > TIMEOUT_MAX_MS) {
      problems.push(`${tag} timeoutMs ${TIMEOUT_MIN_MS}-${TIMEOUT_MAX_MS} aralığında olmalı (verilen: ${def.timeoutMs})`);
    }
    if (!Number.isInteger(def.retry.maxAttempts) || def.retry.maxAttempts < 0 || def.retry.maxAttempts > RETRY_MAX) {
      problems.push(`${tag} retry.maxAttempts 0-${RETRY_MAX} olmalı (verilen: ${def.retry.maxAttempts})`);
    }

    for (const cap of def.allowedCapabilities) {
      if (!capSet.has(cap)) problems.push(`${tag} tanımsız capability: "${cap}"`);
    }
    for (const scope of [...def.memoryReadScopes, ...def.memoryWriteScopes]) {
      if (!scopeSet.has(scope)) problems.push(`${tag} tanımsız memory scope: "${scope}"`);
    }

    // Provenance ↔ memory write çelişkisi: external provenance hiçbir hafıza
    // scope'una yazamaz (identity için mutlak kural — assertIdentityWriteAllowed
    // ile aynı sınır; registry bunu konfigürasyon düzeyinde de kilitler).
    if (def.provenance === "external" && def.memoryWriteScopes.length > 0) {
      problems.push(`${tag} external provenance hafıza yazamaz (memoryWriteScopes: ${def.memoryWriteScopes.join(",")})`);
    }
    if (def.memoryWriteScopes.includes("identity") && def.provenance === "external") {
      problems.push(`${tag} external provenance identity yazamaz`);
    }

    // Adapter'ın gerçekten kullandığı capability/memory-write entry allowlist'inin
    // alt kümesi olmalı — adapter tanımdan fazlasını yapamaz.
    const adapter = adapters[def.adapterId];
    if (adapter) {
      for (const used of adapter.capabilitiesUsed) {
        if (!def.allowedCapabilities.includes(used)) {
          problems.push(`${tag} adapter "${adapter.id}" izin verilmeyen capability kullanıyor: "${used}"`);
        }
      }
      for (const w of adapter.memoryWritesUsed) {
        if (!def.memoryWriteScopes.includes(w)) {
          problems.push(`${tag} adapter "${adapter.id}" izin verilmeyen memory-write kullanıyor: "${w}"`);
        }
      }
    }

    if (def.status === "enabled") {
      if (def.evalFixtureIds.length === 0) {
        problems.push(`${tag} aktif entry en az bir deterministik fixture gerektirir`);
      }
      for (const fid of def.evalFixtureIds) {
        const fixture = fixtureById(fid);
        if (!fixture) {
          problems.push(`${tag} fixture bulunamadı: "${fid}"`);
          continue;
        }
        if (fixture.agentId !== def.id) {
          problems.push(`${tag} fixture "${fid}" başka agent'a ait (${fixture.agentId})`);
          continue;
        }
        if (isZodSchema(def.inputSchema)) {
          const parsed = (def.inputSchema as z.ZodTypeAny).safeParse(fixture.input);
          if (!parsed.success) {
            problems.push(`${tag} fixture "${fid}" inputSchema'dan geçmiyor: ${parsed.error.issues[0]?.message ?? "?"}`);
          }
        }
      }
    }
  }

  return problems;
}

export function validateRegistry(
  definitions: AgentDefinition[],
  adapters: Record<string, AgentAdapter>
): void {
  const problems = collectRegistryProblems(definitions, adapters);
  if (problems.length > 0) throw new AgentRegistryError(problems);
}
