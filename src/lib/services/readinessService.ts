/**
 * Per-draft yayına-hazırlık (readiness) — SAF, yan-etkisiz. "Bu TASLAK yayına
 * hazır mı?" sorusunu yanıtlar (operatorReadinessService = "pipeline bugün
 * üretebilir mi", AYRI concern).
 *
 * Sözleşme (FINAL-PLAN §1C, ADR-020 desktop):
 *  - Her çağrıda güncel metin = `editedContent ?? content`; SONUÇ PERSIST EDİLMEZ.
 *  - judged=false / skor eksik / legacy → ASLA `ready` (fail-closed).
 *  - `blocked` YALNIZ ciddi durum: char-limit aşımı · yüksek risk · kaynaksız
 *    somut istatistik iddiası · güvenlik/policy lint. Stil kusuru `blocked` YAPMAZ.
 *  - `needs_edit`: fail-closed + high leak + yabancı-dil sızıntısı + hesap-bazlı
 *    emoji/soru-CTA + banned_phrase + yapısız thread.
 *  - Yayın anında publishService bunu YENİDEN çalıştırır (eski üretim sonucu baz
 *    alınmaz).
 *
 * Eşikler **provisional** — canlı queue verisiyle kalibre edilip dondurulmalı
 * (ADR-020 açık risk; OpenRouter-402 canlı üretime bağlı). Fixture-kilitli.
 */

import {
  effectiveThreadSegmentLimit,
  isThreadDraft,
  joinThreadSegments,
  THREAD_MIN_SEGMENTS,
} from "@/lib/growth-engine/threadSegments";

export type ReadinessLeak = { kind: string; severity: "low" | "med" | "high"; note: string };
export type ReadinessLintIssue = { code: string; severity?: string; message: string };
export type ReadinessSegment = { text: string };

export type ReadinessInput = {
  content: string;
  editedContent: string | null;
  status: string;
  /** "TWEET" | "THREAD" | … (case-insensitive) */
  draftType: string;
  /** Phase 2D (ADR-031/033): dinamik hesap — bilinmeyen handle grafikcem'e
   *  MAP EDİLMEZ; seed'li hesap politikaları yalnız EXACT eşleşmede uygulanır. */
  accountHandle: string;
  /** Üretim modu — mode="thread" olan taslak draftType'tan bağımsız thread'dir. */
  mode?: string | null;
  maxChars: number;
  judged: boolean;
  turkishNaturalness: number | null;
  riskScore: number | null;
  sourceFaithfulness: number | null;
  leaks: ReadinessLeak[];
  lintIssues: ReadinessLintIssue[];
  /** sourcePostId || newsItemId var mı (kaynağa bağlı mı). */
  hasSource: boolean;
  /** Yapısal thread segmentleri (yoksa null). */
  threadSegments: ReadinessSegment[] | null;
};

export type ReadinessState = "ready" | "needs_edit" | "blocked";
export type ReadinessSeverity = "block" | "edit";
export type ReadinessReason = { code: string; severity: ReadinessSeverity; message: string };
export type ReadinessResult = { state: ReadinessState; reasons: ReadinessReason[] };

/**
 * PublishAttempt.readinessSnapshotJson / readinessPolicyVersion için (Faz 1E).
 * Phase 2D (ADR-033) semantik değişimi → 1.1.0: thread tespiti mode-farkındalı,
 * segment sınırı effectiveThreadSegmentLimit (min(280, maxChars)), thread metni
 * canonical segmentlerden türetilir, ≥2 segment şartı. Skor eşikleri hâlâ
 * PROVISIONAL — canlı etiketli örneklem yetersiz (audit 2026-07-16:
 * calibrationStatus=insufficient_sample). Eski snapshot'lar eski versiyon
 * damgasıyla okunmaya devam eder (şekil değişmedi).
 */
export const READINESS_POLICY_VERSION = "1.1.0-provisional";

// ── Provisional eşikler (canlı kalibrasyon bekliyor) ──────────────────────────
const TURKISH_NATURALNESS_MIN = 55; // scoreSignals ile aynı
const RISK_BLOCK_MIN = 75; // ciddi risk → blocked
const FOREIGN_TOKEN_MIN = 2; // ≥2 farklı İngilizce fonksiyon-kelimesi → sızıntı

/** Somut sayısal/istatistik iddia sinyalleri (kaynaksızsa blocked). Küçük
 *  tamsayı ("5 dakikada") KASITLI dışarıda — false-block'u önlemek için yalnız
 *  yüzde/para/büyüklük/yıl gibi teyit-gerektiren iddialar. */
const CLAIM_PATTERNS: RegExp[] = [
  /%\s*\d/,
  /\d+\s*%/,
  /[$₺€£]\s*\d/,
  /\d[\d.,]*\s*(dolar|tl|euro|lira)\b/i,
  /\d[\d.,]*\s*(kat|milyon|milyar|bin|trilyon)\b/i,
  /\b(19|20)\d{2}\b/,
];

/** Güvenlik/policy sınıfı lint kodları → blocked. */
const SECURITY_LINT_CODES = new Set(["security", "policy_violation", "pii_leak", "prohibited"]);

/**
 * Türkçe metinde İngilizce cümle sızıntısı için ayırt edici İngilizce
 * fonksiyon/ortak kelimeler. Yaygın Türkçe homograf'ı OLANLAR (not/can/is-iş…)
 * ve kısa/riskli kelimeler bilinçle DIŞARIDA — kelime-özel hack değil, sınıf
 * bazlı. Marka/teknik NOUN'lar (TinEye/C2PA…) zaten eşleşmez → allowlist örtük.
 */
const EN_FUNCTION_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "these", "those", "from", "your",
  "their", "they", "them", "have", "has", "had", "will", "would", "should",
  "could", "what", "when", "which", "because", "about", "into", "over", "than",
  "then", "been", "being", "only", "very", "more", "most", "some", "here",
  "there", "where", "while", "after", "before", "other", "every", "also",
  "such", "each", "both",
]);

const EMOJI_RE = /\p{Extended_Pictographic}/u;

function currentText(input: ReadinessInput): string {
  return (input.editedContent?.trim() || input.content.trim());
}

/**
 * Phase 2D: thread'de içerik kontrollerinin değerlendirdiği metin canonical
 * SEGMENTLERDEN türetilir — stale QueueItem.content/editedContent güvenlik
 * kontrollerini bypass edemez. Segment yoksa mevcut metne düşer (o taslak
 * zaten structureless_thread ile needs_edit olur).
 */
function currentThreadText(input: ReadinessInput): string {
  if (input.threadSegments && input.threadSegments.length > 0) {
    return joinThreadSegments(
      input.threadSegments.map((s) => ({ text: s.text }))
    );
  }
  return currentText(input);
}

/** Türkçe karakterleri KORUYARAK tokenize (transliterasyon YOK → iş≠is). */
function countForeignTokens(text: string): number {
  const tokens = text.toLowerCase().split(/[^a-zçğıöşü0-9]+/i).filter(Boolean);
  const found = new Set<string>();
  for (const tok of tokens) {
    if (EN_FUNCTION_WORDS.has(tok)) found.add(tok);
  }
  return found.size;
}

function dedupe(reasons: ReadinessReason[]): ReadinessReason[] {
  const seen = new Set<string>();
  const out: ReadinessReason[] = [];
  for (const r of reasons) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(r);
  }
  return out;
}

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  // Phase 2D: thread tespiti mode-farkındalı — audit (2026-07-16) canlıdaki 13
  // thread taslağının TAMAMININ mode=thread + draftType=TWEET olduğunu ve tek
  // tweet gibi yanlış "ready" geçtiğini gösterdi.
  const isThread = isThreadDraft(input.draftType, input.mode);
  const text = isThread ? currentThreadText(input) : currentText(input);
  const segmentLimit = effectiveThreadSegmentLimit(input.maxChars);
  const blocks: ReadinessReason[] = [];
  const edits: ReadinessReason[] = [];

  // ── BLOCK (öncelikli) ──────────────────────────────────────────────────────
  if (!isThread && text.length > input.maxChars) {
    blocks.push({
      code: "over_char_limit",
      severity: "block",
      message: `Metin ${text.length}/${input.maxChars} karakter — hesap sınırını aşıyor, yayınlanamaz.`,
    });
  }
  if (input.riskScore != null && input.riskScore >= RISK_BLOCK_MIN) {
    blocks.push({
      code: "high_risk",
      severity: "block",
      message: `Risk skoru ${input.riskScore} (≥${RISK_BLOCK_MIN}) — yayından önce ciddi inceleme gerekir.`,
    });
  }
  if (!input.hasSource && CLAIM_PATTERNS.some((re) => re.test(text))) {
    blocks.push({
      code: "unverified_concrete_claim",
      severity: "block",
      message: "Somut sayısal/istatistik iddia var ama bağlı kaynak yok — doğrulanmadan yayınlanamaz.",
    });
  }
  for (const issue of input.lintIssues) {
    if (issue.severity === "error" || SECURITY_LINT_CODES.has(issue.code)) {
      blocks.push({ code: "security_policy", severity: "block", message: issue.message });
    }
  }

  if (blocks.length > 0) return { state: "blocked", reasons: dedupe(blocks) };

  // ── NEEDS_EDIT ──────────────────────────────────────────────────────────────
  if (!input.judged) {
    edits.push({
      code: "not_judged",
      severity: "edit",
      message: "Taslak değerlendirilmedi (judged=false) — yayına hazır sayılamaz.",
    });
  }
  if (input.turkishNaturalness == null) {
    edits.push({
      code: "missing_score",
      severity: "edit",
      message: "Skor eksik/legacy — güvenli tarafta düzenleme gerekli.",
    });
  } else if (input.judged && input.turkishNaturalness < TURKISH_NATURALNESS_MIN) {
    edits.push({
      code: "low_turkish",
      severity: "edit",
      message: `Türkçe doğallık ${input.turkishNaturalness}/100 (<${TURKISH_NATURALNESS_MIN}) — elden geçir.`,
    });
  }
  for (const leak of input.leaks) {
    if (leak.severity === "high") {
      edits.push({ code: "high_leak", severity: "edit", message: `Yüksek riskli sızıntı (${leak.kind}): ${leak.note}` });
    }
  }
  const foreign = countForeignTokens(text);
  if (foreign >= FOREIGN_TOKEN_MIN) {
    edits.push({
      code: "foreign_language",
      severity: "edit",
      message: `Yabancı-dil sızıntısı (${foreign} İngilizce token) — Türkçeleştir.`,
    });
  }
  for (const issue of input.lintIssues) {
    if (issue.code === "banned_phrase" || issue.code === "question_cta") {
      edits.push({ code: issue.code, severity: "edit", message: issue.message });
    }
  }
  // Hesap-bazlı politika: @grafikcem emoji kullanmaz (accounts.ts formatRules).
  if (input.accountHandle === "grafikcem" && EMOJI_RE.test(text)) {
    edits.push({ code: "emoji_policy", severity: "edit", message: "@grafikcem emoji kullanmaz — kaldır." });
  }
  // Thread: yapısal segment ŞART; metindeki "1/" numaralandırma kanıt DEĞİL.
  // Phase 2D: her segment effectiveThreadSegmentLimit (min(280, maxChars)) ile
  // denetlenir — UI ile AYNI primitive; ayrıca thread ≥2 segment taşımalı.
  if (isThread) {
    if (!input.threadSegments || input.threadSegments.length === 0) {
      edits.push({
        code: "structureless_thread",
        severity: "edit",
        message: "Thread ama yapısal segment yok — segmentlere böl ('1/' metni kanıt sayılmaz).",
      });
    } else {
      if (input.threadSegments.length < THREAD_MIN_SEGMENTS) {
        edits.push({
          code: "thread_too_short",
          severity: "edit",
          message: `Thread en az ${THREAD_MIN_SEGMENTS} segment taşımalı (şu an ${input.threadSegments.length}).`,
        });
      }
      const badIdx = input.threadSegments.findIndex((s) => {
        const t = s.text.trim();
        return t.length === 0 || t.length > segmentLimit;
      });
      if (badIdx >= 0) {
        edits.push({
          code: "thread_segment_invalid",
          severity: "edit",
          message: `Segment ${badIdx + 1} boş veya ${segmentLimit} karakter sınırını aşıyor.`,
        });
      }
    }
  }
  if (input.status === "needs_edit") {
    edits.push({ code: "flagged_needs_edit", severity: "edit", message: "Taslak zaten düzenleme bekliyor olarak işaretli." });
  }

  if (edits.length > 0) return { state: "needs_edit", reasons: dedupe(edits) };
  return { state: "ready", reasons: [] };
}
