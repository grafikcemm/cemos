/**
 * CemOS Learn — TEK kanonik durum haritası (4C-E). source.status + job(status/stage/error)
 * + pack.status → kullanıcıya gösterilen tek durum. Route/UI ikinci bir readiness sözlüğü
 * KURMAZ; hepsi buradan türer. Çelişki (job done ama pack yok, source ready ama qa_failed,
 * budget genel hata görünüyor, transcript-yok manuel yol kayboluyor) burada engellenir.
 */

export type LearnUserState =
  | "inbox" // eklendi, işlenmedi
  | "processing" // aşamalar ilerliyor
  | "transcript_required" // transkript yok → manuel yapıştırma ile devam
  | "budget_blocked" // aylık bütçe doldu → LLM aşaması bekliyor
  | "needs_review" // QA "review" → hazır bilgi DEĞİL, inceleme gerekli
  | "ready" // QA pass + tekrar programı açık
  | "failed"; // kurtarılamayan hata / QA fail

export type LearnStatusInput = {
  sourceStatus: string; // new | processing | ready | failed
  jobStatus: string | null; // pending | running | done | failed
  jobStage: string | null;
  jobError: string | null; // "budget" | "transcript_unavailable" | serbest hata metni
  packStatus: string | null; // draft | qa_pending | ready | qa_failed
};

export type LearnStateView = {
  state: LearnUserState;
  label: string;
  /** Job ilerletilebilir mi (advance çağrısı anlamlı mı). ready/inbox dışı çoğu durumda true. */
  canAdvance: boolean;
  /** transcript_required → kullanıcı manuel transkript yapıştırabilir. */
  needsManualTranscript: boolean;
};

const LABELS: Record<LearnUserState, string> = {
  inbox: "Sırada",
  processing: "İşleniyor",
  transcript_required: "Transkript gerekli",
  budget_blocked: "Bütçe doldu",
  needs_review: "İnceleme gerekli",
  ready: "Hazır",
  failed: "Başarısız",
};

/**
 * Öncelik sırası (yukarıdan aşağı ilk eşleşen kazanır):
 *  1. bütçe engeli (job pending + error=budget) → budget_blocked
 *  2. transkript yok (error=transcript_unavailable ya da source failed + o hata) → transcript_required
 *  3. job failed (başka hata) → failed
 *  4. pack qa_failed → failed (grounding güvenilmez, hazır DEĞİL)
 *  5. pack ready + job done → ready (QA pass + review_schedule geçildi)
 *  6. pack qa_pending → needs_review
 *  7. job pending/running → processing
 *  8. henüz job yok / source new → inbox
 */
export function deriveLearnState(input: LearnStatusInput): LearnStateView {
  const err = input.jobError ?? "";
  const isTranscriptErr =
    err === "transcript_unavailable" || err.includes("transkript") || err.includes("transcript");

  let state: LearnUserState;
  let needsManualTranscript = false;

  if (err === "budget" || err === "budget_exceeded") {
    state = "budget_blocked";
  } else if (isTranscriptErr) {
    state = "transcript_required";
    needsManualTranscript = true;
  } else if (input.jobStatus === "failed" || input.sourceStatus === "failed") {
    state = "failed";
  } else if (input.packStatus === "qa_failed") {
    state = "failed";
  } else if (input.packStatus === "ready" && input.jobStatus === "done") {
    state = "ready";
  } else if (input.packStatus === "qa_pending") {
    state = "needs_review";
  } else if (input.jobStatus === "pending" || input.jobStatus === "running") {
    state = "processing";
  } else if (input.jobStatus === "done") {
    // job bitti ama pack ready değil (nadir: draft) → inceleme gerekli (hazır DEĞİL).
    state = input.packStatus === "ready" ? "ready" : "needs_review";
  } else {
    state = input.sourceStatus === "new" ? "inbox" : "processing";
  }

  const canAdvance = state !== "ready" && state !== "failed";
  return { state, label: LABELS[state], canAdvance, needsManualTranscript };
}

export function learnStateLabel(state: LearnUserState): string {
  return LABELS[state];
}
