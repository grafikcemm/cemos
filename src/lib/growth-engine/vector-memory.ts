import { prisma } from "@/lib/db/client";
import { accountRepo } from "@/lib/db/accountRepo";
import { trainingExampleRepo } from "@/lib/db/trainingExampleRepo";
import { usageService } from "@/lib/services/usageService";
import { safeJsonStringify } from "@/lib/growth-engine/types";
import type {
  MemoryLabel,
  VectorMemoryInput,
  EmbeddingVector,
  MemorySearchResult,
  MemoryContext,
  BuildMemoryContextInput,
} from "@/lib/growth-engine/types";

/**
 * Creates a deterministic local fallback embedding using feature hashing (the hashing trick).
 * Generates a 256-dimensional unit vector from any text.
 */
export function createLocalFallbackEmbedding(text: string): EmbeddingVector {
  const dimensions = 256;
  const values = new Array(dimensions).fill(0);

  // Normalize text: lowercase, strip punctuation, clean whitespace
  const normalized = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return {
      provider: "local_fallback",
      dimensions,
      values: new Array(dimensions).fill(0),
      createdAt: new Date().toISOString(),
    };
  }

  for (const token of tokens) {
    // Polynomial rolling hash for dimension index mapping
    let hashIndex = 0;
    for (let i = 0; i < token.length; i++) {
      hashIndex = (hashIndex * 31 + token.charCodeAt(i)) % dimensions;
    }

    // Secondary rolling hash for coordinate sign (+1 or -1) to reduce collision bias
    let hashSign = 0;
    for (let i = 0; i < token.length; i++) {
      hashSign = (hashSign * 17 + token.charCodeAt(i)) % 2;
    }
    const val = hashSign === 0 ? -1 : 1;
    values[hashIndex] += val;
  }

  // Normalize vector values to unit length so dot product is equivalent to cosine similarity
  let sumOfSquares = 0;
  for (const v of values) {
    sumOfSquares += v * v;
  }

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      values[i] = values[i] / magnitude;
    }
  }

  return {
    provider: "local_fallback",
    dimensions,
    values,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates an embedding vector. Tries OpenRouter embeddings endpoint if key is present,
 * and seamlessly falls back to deterministic local hashing in case of any failures.
 */
export async function createEmbedding(text: string): Promise<EmbeddingVector> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return createLocalFallbackEmbedding(text);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    const values = data.data?.[0]?.embedding;
    if (Array.isArray(values) && values.length > 0) {
      // Account the real OpenRouter embedding spend (was silently $0). The monthly
      // CEILING was already enforced via the provider-usage max in costGate, but
      // per-purpose attribution was missing. Rough token estimate (~4 chars/token)
      // at text-embedding-3-small pricing ($0.02 / 1M tokens). Best-effort.
      const estTokens = Math.ceil(text.length / 4);
      await usageService
        .recordOpenRouter({
          estimatedCostUsd: (estTokens / 1_000_000) * 0.02,
          model: "openai/text-embedding-3-small",
          meta: { purpose: "embedding" },
        })
        .catch(() => {});
      return {
        provider: "openrouter",
        model: "openai/text-embedding-3-small",
        dimensions: values.length,
        values,
        createdAt: new Date().toISOString(),
      };
    }
    throw new Error("Invalid response format");
  } catch (err) {
    // Graceful fallback to deterministic local embedding on network/API failure
    return createLocalFallbackEmbedding(text);
  }
}

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a value normalized between 0.0 and 1.0. Returns 0.0 for malformed input.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  if (isNaN(similarity)) {
    return 0;
  }

  // Clamp and map similarity to [0, 1] range safely
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Embeds a single TrainingExample and stores it in the SQLite TEXT column.
 */
export async function embedTrainingExample(exampleId: string): Promise<EmbeddingVector> {
  const example = await trainingExampleRepo.findById(exampleId);
  if (!example) {
    throw new Error(`TrainingExample with ID ${exampleId} not found.`);
  }

  const textToEmbed = [example.sourceContent, example.outputContent]
    .filter((t) => typeof t === "string" && t.trim().length > 0)
    .join("\n") || example.outputContent || "";

  const embedding = await createEmbedding(textToEmbed);
  await trainingExampleRepo.updateEmbedding(exampleId, safeJsonStringify(embedding));
  return embedding;
}

/**
 * Embeds all training examples with missing embeddingJson for a given account.
 * Skips corrupt/existing embeddingJson values without raising fatal errors.
 */
export async function embedTrainingExamplesByAccount(
  accountId: string
): Promise<{ embedded: number; skipped: number; failed: number }> {
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  const examples = await prisma.trainingExample.findMany({
    where: { accountId },
  });

  for (const ex of examples) {
    if (ex.embeddingJson) {
      skipped++;
      continue;
    }

    try {
      await embedTrainingExample(ex.id);
      embedded++;
    } catch {
      failed++;
    }
  }

  return { embedded, skipped, failed };
}

/**
 * Sorgu-anı embedding cache'i (FIRST-SPRINT item 14). ViralPattern'ın kalıcı
 * embedding kolonu yok (migration yasak) — pattern metni her aramada GERÇEK
 * embedding ile vektörlenir; process-içi cache tekrar maliyetini sıfırlar.
 * `createEmbedding` zaten hata durumunda local-hash'e düşer (yalnız fallback).
 */
const queryTimeEmbeddingCache = new Map<string, EmbeddingVector>();
const QUERY_EMBED_CACHE_MAX = 500;

/** Kararlı, ucuz metin hash'i (djb2) — kalıcı pattern embedding tazelik kontrolü. */
function textHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function getCachedEmbedding(cacheKey: string, text: string): Promise<EmbeddingVector> {
  const cached = queryTimeEmbeddingCache.get(cacheKey);
  if (cached) return cached;
  const embedding = await createEmbedding(text);
  // local_fallback sonuçlarını cache'leme: API bir sonraki aramada ayağa
  // kalkmışsa gerçek embedding'e geçebilsin.
  if (embedding.provider !== "local_fallback") {
    if (queryTimeEmbeddingCache.size >= QUERY_EMBED_CACHE_MAX) {
      const firstKey = queryTimeEmbeddingCache.keys().next().value;
      if (firstKey !== undefined) queryTimeEmbeddingCache.delete(firstKey);
    }
    queryTimeEmbeddingCache.set(cacheKey, embedding);
  }
  return embedding;
}

/**
 * Helper to map DB label and reason to MemoryLabel
 */
export function mapTrainingLabelToMemoryLabel(label: string, reason?: string): MemoryLabel {
  const normReason = reason?.toLowerCase() || "";
  if (normReason.includes("pattern") || normReason.includes("saved_as_pattern")) {
    return "pattern";
  }
  if (label === "good" || label === "published") {
    return "positive";
  }
  if (label === "bad") {
    return "negative";
  }
  if (label === "edited") {
    return "edited";
  }
  if (label === "pattern") {
    return "pattern";
  }
  return "unknown";
}

/**
 * Performs semantic similarity search across account-isolated training examples and viral patterns.
 */
export async function searchSimilarExamples(
  input: VectorMemoryInput
): Promise<MemorySearchResult[]> {
  const dbAccount = await accountRepo.findByHandle(input.accountHandle);
  if (!dbAccount) {
    throw new Error(`Account not found for handle: ${input.accountHandle}`);
  }
  const accountId = dbAccount.id;

  const queryEmbedding = await createEmbedding(input.text);
  const candidates: MemorySearchResult[] = [];

  // Query Training Examples
  const examples = await prisma.trainingExample.findMany({
    where: { accountId },
  });

  for (const ex of examples) {
    let vectorValues: number[] | null = null;
    if (ex.embeddingJson) {
      try {
        const parsed = JSON.parse(ex.embeddingJson);
        if (parsed && Array.isArray(parsed.values)) {
          vectorValues = parsed.values;
        } else if (Array.isArray(parsed)) {
          vectorValues = parsed;
        }
      } catch {
        // Skip corrupt/malformed entries gracefully
        continue;
      }
    }

    // Kalıcı embedding yoksa GERÇEK embedding ile sorgu-anı vektörleme
    // (item 14): local-hash yalnız createEmbedding içindeki hata fallback'i.
    // Eski davranış (her zaman 256-dim local-hash) gerçek 1536-dim sorgu
    // vektörüyle boyut uyuşmazlığı yaratıp benzerliği kalıcı 0 yapıyordu.
    if (!vectorValues) {
      const textToEmbed = [ex.sourceContent, ex.outputContent]
        .filter((t) => typeof t === "string" && t.trim().length > 0)
        .join("\n") || ex.outputContent || "";
      const embedding = await getCachedEmbedding(`ex:${ex.id}`, textToEmbed);
      vectorValues = embedding.values;
    }

    const similarity = cosineSimilarity(queryEmbedding.values, vectorValues);
    const label = mapTrainingLabelToMemoryLabel(ex.label, ex.reason);

    candidates.push({
      id: ex.id,
      accountHandle: input.accountHandle,
      label,
      sourceType: "training_example",
      sourceContent: ex.sourceContent || undefined,
      outputContent: ex.outputContent,
      reason: ex.reason || undefined,
      similarity,
    });
  }

  // Query Viral Patterns (only check if looking for pattern or if no filter active)
  if (!input.label || input.label === "pattern") {
    const patterns = await prisma.viralPattern.findMany({
      where: { accountId },
    });

    for (const p of patterns) {
      const patternText = [p.patternName, p.exampleGood]
        .filter((t) => typeof t === "string" && t.trim().length > 0)
        .join("\n") || p.patternName;

      // Item 14 fix: pattern retrieval GERÇEK embedding kullanır (local-hash
      // yalnız fallback). Sprint 9: kalıcı embeddingJson kolonu — metin
      // değişmediyse (hash tutuyorsa) tekrar embed ETMEZ, süreçler arası maliyeti
      // sıfırlar. Bozuk/bayat/eksik → yeniden hesaplar ve (gerçekse) kalıcılaştırır.
      const hash = textHash(patternText);
      let vectorValues: number[] | null = null;
      if (p.embeddingJson && p.embeddingHash === hash) {
        try {
          const parsed = JSON.parse(p.embeddingJson);
          if (Array.isArray(parsed)) vectorValues = parsed;
          else if (parsed && Array.isArray(parsed.values)) vectorValues = parsed.values;
        } catch {
          // bozuk kayıt → yeniden hesapla
        }
        // BOYUT KORUMASI: sorgu embedding'i local_fallback'e (256-dim) düşmüşse
        // (key yok / 402), kalıcı 1536-dim vektör cosine'da sessizce 0 verir.
        // Boyut uyuşmuyorsa kalıcıyı KULLANMA → yeniden hesap aynı provider'a
        // düşer, iki taraf tutarlı kalır (persist-öncesi davranış).
        if (vectorValues && vectorValues.length !== queryEmbedding.values.length) {
          vectorValues = null;
        }
      }

      if (!vectorValues) {
        const patternEmbedding = await getCachedEmbedding(
          `vp:${p.id}:${p.updatedAt instanceof Date ? p.updatedAt.getTime() : ""}`,
          patternText,
        );
        vectorValues = patternEmbedding.values;
        // Yalnız GERÇEK embedding'i kalıcılaştır (local_fallback boyut uyumsuzluğu
        // yaratır ve kalıcı gerçek vektörü EZMEMELİ). Best-effort — persist her
        // türlü hatada (senkron dahil) yutulur; retrieval asla bozulmaz.
        if (patternEmbedding.provider !== "local_fallback") {
          try {
            await prisma.viralPattern.update({
              where: { id: p.id },
              data: { embeddingJson: JSON.stringify(vectorValues), embeddingHash: hash },
            });
          } catch {
            /* persist best-effort */
          }
        }
      }

      const similarity = cosineSimilarity(queryEmbedding.values, vectorValues);

      candidates.push({
        id: p.id,
        accountHandle: input.accountHandle,
        label: "pattern",
        sourceType: "viral_pattern",
        sourceContent: p.patternName,
        outputContent: p.exampleGood || "",
        reason: p.hookType || undefined,
        similarity,
      });
    }
  }

  // Filter by label if requested
  let results = candidates;
  if (input.label) {
    results = results.filter((r) => r.label === input.label);
  }

  // Sort similarity descending, apply limit
  results.sort((a, b) => b.similarity - a.similarity);
  const limit = input.limit ?? 10;

  return results.slice(0, limit);
}

/**
 * Builds a composite semantic MemoryContext for RAG in draft generation.
 */
export async function buildMemoryContext(
  input: BuildMemoryContextInput
): Promise<MemoryContext> {
  const limitPerGroup = input.limitPerGroup ?? 3;
  const searchText = [input.sourceContent, input.manualIdea, input.draftContent]
    .filter((t) => typeof t === "string" && t.trim().length > 0)
    .join("\n")
    .trim() || "context";

  const warnings: string[] = [];

  try {
    const [positiveExamples, negativeExamples, editedExamples, patternExamples] = await Promise.all([
      searchSimilarExamples({
        accountHandle: input.accountHandle,
        text: searchText,
        label: "positive",
        limit: limitPerGroup,
      }),
      searchSimilarExamples({
        accountHandle: input.accountHandle,
        text: searchText,
        label: "negative",
        limit: limitPerGroup,
      }),
      searchSimilarExamples({
        accountHandle: input.accountHandle,
        text: searchText,
        label: "edited",
        limit: limitPerGroup,
      }),
      searchSimilarExamples({
        accountHandle: input.accountHandle,
        text: searchText,
        label: "pattern",
        limit: limitPerGroup,
      }),
    ]);

    return {
      positiveExamples,
      negativeExamples,
      editedExamples,
      patternExamples,
      warnings,
    };
  } catch (err) {
    return {
      positiveExamples: [],
      negativeExamples: [],
      editedExamples: [],
      patternExamples: [],
      warnings: [`Memory retrieval failed: ${err instanceof Error ? err.message : "Unknown error"}`],
    };
  }
}

/**
 * Produces a clipped, formatted in-prompt snippet representation of a memory result.
 */
export function memoryResultToPromptSnippet(result: MemorySearchResult): string {
  const maxLen = 150;
  const cleanText = (text: string) => {
    let t = text.replace(/\s+/g, " ").trim();
    if (t.length > maxLen) {
      t = t.slice(0, maxLen) + "...";
    }
    return t;
  };

  const output = cleanText(result.outputContent);
  if (result.sourceContent) {
    const source = cleanText(result.sourceContent);
    return `Input: "${source}" -> Output: "${output}"`;
  }
  return `Output: "${output}"`;
}

/**
 * Compiles MemoryContext into a beautiful Markdown prompt block.
 */
export function buildMemoryPromptBlock(context: MemoryContext): string {
  const blocks: string[] = [];

  const positive = (context.positiveExamples || []).slice(0, 3);
  const edited = (context.editedExamples || []).slice(0, 2);
  const negative = (context.negativeExamples || []).slice(0, 2);
  const pattern = (context.patternExamples || []).slice(0, 2);

  if (positive.length > 0) {
    blocks.push(
      "PAST WINNING EXAMPLES (Study their hooks and flow - replicate their style!):\n" +
        positive.map((r) => `* ${memoryResultToPromptSnippet(r)}`).join("\n")
    );
  }

  if (negative.length > 0) {
    blocks.push(
      "PAST REJECTED EXAMPLES (AVOID this style, tone, and mistakes - do not replicate!):\n" +
        negative
          .map((r) => {
            const snippet = memoryResultToPromptSnippet(r);
            const reason = r.reason ? ` Reason: ${r.reason}` : "";
            return `* Avoid this style: ${snippet}${reason}`;
          })
          .join("\n")
    );
  }

  if (edited.length > 0) {
    blocks.push(
      "PAST EDITED EXAMPLES (Learn how the editor improved original drafts):\n" +
        edited
          .map((r) => {
            if (r.sourceContent) {
              return `* Original Draft: "${r.sourceContent.replace(/\s+/g, " ").trim()}" -> Improved Editorial Style: "${r.outputContent.replace(/\s+/g, " ").trim()}"`;
            }
            return `* Improved Style: "${r.outputContent.replace(/\s+/g, " ").trim()}"`;
          })
          .join("\n")
    );
  }

  if (pattern.length > 0) {
    blocks.push(
      "PAST SUCCESSFUL PATTERN EXAMPLES:\n" +
        pattern.map((r) => `* Pattern Hook/Style: ${memoryResultToPromptSnippet(r)}`).join("\n")
    );
  }

  if (blocks.length === 0) {
    return "";
  }

  return (
    "\n=== SEMANTIC MEMORY / IN-CONTEXT LEARNING ===\n" +
    "Gelişmiş üretim için aşağıdaki geçmiş iyi/kötü/düzenlenmiş örnekleri ve kısıtları göz önünde bulundur. Bu örnekler senin geçmişte yaptığın doğrular ve hatalardır:\n\n" +
    blocks.join("\n\n") +
    "\n=============================================\n"
  );
}
