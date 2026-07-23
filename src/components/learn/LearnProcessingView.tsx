"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, RotateCcw, ClipboardPaste, Wallet } from "lucide-react";
import { Card, Button, Textarea } from "@/components/ui";
import { STAGE_ORDER, STAGE_LABELS, PASSTHROUGH_STAGES, type LearnStage } from "@/lib/learning/pipeline/stages";

/** advance sonucu (AdvanceResult) + GET job (JobView) ortak alanları. */
type AdvanceResult = { currentStage: LearnStage; status: string; error: string | null; packId: string | null };
type JobView = AdvanceResult & {
  id: string;
  userState: string; // inbox | processing | transcript_required | budget_blocked | needs_review | ready | failed
  needsManualTranscript: boolean;
};

const ADVANCE_BACKOFF_MS = 500; // pending/running arası kontrollü bekleme (tight loop yok)

async function getJob(jobId: string): Promise<JobView | null> {
  try {
    const res = await fetch(`/api/learn/jobs/${jobId}`);
    const json = await res.json();
    return json.success ? (json.job as JobView) : null;
  } catch {
    return null;
  }
}

async function postAdvance(
  jobId: string
): Promise<{ ok: boolean; result?: AdvanceResult; code?: string; error?: string }> {
  const res = await fetch(`/api/learn/jobs/${jobId}/advance`, { method: "POST" });
  const json = await res.json();
  if (json.success) return { ok: true, result: json as AdvanceResult };
  return { ok: false, code: json.code, error: json.error };
}

export default function LearnProcessingView({
  jobId,
  sourceId,
  onDone,
  onCancel,
}: {
  jobId: string;
  sourceId: string | null;
  onDone: (packId: string | null) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<LearnStage>("source_created");
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [budgetBlocked, setBudgetBlocked] = useState(false);
  const [transcriptMissing, setTranscriptMissing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function runLoop() {
    if (runningRef.current) return; // tek advance döngüsü (çift-loop yok)
    runningRef.current = true;
    (async () => {
      try {
        while (!cancelledRef.current) {
          const r = await postAdvance(jobId);
          if (cancelledRef.current) break; // unmount/cancel sonrası setState yok
          if (!r.ok) {
            if (r.code === "budget") setBudgetBlocked(true);
            else if (r.code === "transcript_unavailable") setTranscriptMissing(true);
            else setError(r.error ?? "İşlem hatası");
            break;
          }
          const res = r.result!;
          setStage(res.currentStage);
          setStatus(res.status);
          setError(res.error);
          if (res.status === "done") {
            onDone(res.packId);
            break;
          }
          if (res.status === "failed") break;
          await sleep(ADVANCE_BACKOFF_MS); // kontrollü backoff
        }
      } catch {
        // postAdvance/res.json() throw'u (504 HTML gövdesi, kopan bağlantı) döngüden
        // KAÇMAMALI: aksi halde runningRef true kilitlenir → sonsuz spinner, hiçbir
        // recovery paneli yok, "devam et" bile çalışmaz. Dürüst hata + finally reset.
        if (!cancelledRef.current) setError("İşlem kesildi — bağlantı hatası. Tekrar dene.");
      } finally {
        runningRef.current = false; // her çıkışta (başarı/hata/throw) serbest bırak
      }
    })();
  }

  // Mount/reload: önce job durumunu GET et (resume) → duruma göre karar.
  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      const job = await getJob(jobId);
      if (cancelledRef.current) return;
      if (job) {
        setStage(job.currentStage);
        setStatus(job.status);
        setError(job.error);
        if (job.userState === "ready" || job.status === "done") {
          onDone(job.packId);
          return;
        }
        if (job.userState === "budget_blocked") {
          setBudgetBlocked(true);
          return;
        }
        if (job.userState === "transcript_required" || job.needsManualTranscript) {
          setTranscriptMissing(true);
          return;
        }
        if (job.userState === "failed") {
          setError(job.error ?? "İşlem bu adımda durdu.");
          return;
        }
      }
      runLoop(); // processing / inbox → ilerlet
    })();
    return () => {
      cancelledRef.current = true; // sayfadan ayrılma = polling durur (job İPTAL EDİLMEZ)
    };
  }, [jobId]);

  async function submitManual() {
    if (!sourceId || manualText.trim().length < 200) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/learn/sources/${sourceId}/transcript`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: manualText }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Transkript eklenemedi.");
        return;
      }
      // Transkript yazıldı → AYNI job kaldığı yerden devam eder.
      setTranscriptMissing(false);
      setError(null);
      setStatus("pending");
      setManualText("");
      runLoop();
    } finally {
      setSubmitting(false);
    }
  }

  const currentIdx = STAGE_ORDER.indexOf(stage);
  const failed = (status === "failed" || error !== null) && !transcriptMissing && !budgetBlocked;

  return (
    <Card variant="feature" padded>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)" }}>Öğrenme paketi hazırlanıyor</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>Panele dön</Button>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Passthrough (v2'de boş) hariç TÜM gerçek aşamalar gösterilir — notes/graph/tasks/content_ideas dahil. */}
        {STAGE_ORDER.filter((s) => s !== "source_created" && !PASSTHROUGH_STAGES.has(s)).map((s) => {
          const idx = STAGE_ORDER.indexOf(s);
          const done = idx < currentIdx || status === "done";
          const active = idx === currentIdx && status !== "done" && !failed && !transcriptMissing && !budgetBlocked;
          const problemHere = idx === currentIdx && (failed || transcriptMissing || budgetBlocked);
          return (
            <li key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--text-sm)", color: done ? "var(--text-secondary)" : active ? "var(--text-primary)" : "var(--text-muted)", fontWeight: active ? 500 : 400 }}>
              <span style={{ width: 18, display: "inline-flex" }}>
                {done ? (
                  <CheckCircle2 size={16} strokeWidth={2} style={{ color: "var(--green)" }} />
                ) : problemHere ? (
                  <AlertTriangle size={16} strokeWidth={2} style={{ color: "var(--danger)" }} />
                ) : active ? (
                  <Loader2 size={16} strokeWidth={2} className="learn-spin" style={{ color: "var(--accent-text)" }} />
                ) : (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border)", display: "inline-block", margin: "0 4px" }} />
                )}
              </span>
              <span>{STAGE_LABELS[s]}</span>
            </li>
          );
        })}
      </ol>

      {budgetBlocked && (
        <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            <Wallet size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: "var(--accent-text)" }} />
            <span>Aylık öğrenme bütçesi doldu. Bütçe yenilenince bu paket kaldığı aşamadan otomatik devam eder — veri kaybı yok.</span>
          </div>
        </div>
      )}

      {transcriptMissing && (
        <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-2)" }}>
            <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: "var(--danger)" }} />
            <span>Bu video için otomatik transkript alınamadı. Videonun transkriptini aşağıya yapıştır — işleme AYNI yerden devam eder.</span>
          </div>
          <Textarea placeholder="Video transkriptini buraya yapıştır (en az 200 karakter)" value={manualText} onChange={(e) => setManualText(e.target.value)} style={{ minHeight: 160 }} data-testid="processing-manual" />
          <div style={{ marginTop: "var(--space-2)" }}>
            <Button variant="primary" size="sm" onClick={submitManual} disabled={submitting || manualText.trim().length < 200} loading={submitting} iconLeft={submitting ? undefined : <ClipboardPaste size={14} strokeWidth={2} />}>
              Transkripti ekle ve devam et
            </Button>
          </div>
        </div>
      )}

      {failed && (
        <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            <AlertTriangle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error ?? "İşlem bu adımda durdu."}</span>
          </div>
          <Button variant="primary" size="sm" iconLeft={<RotateCcw size={14} strokeWidth={2} />} onClick={() => { setError(null); setStatus("pending"); runLoop(); }}>
            Bu adımdan devam et
          </Button>
        </div>
      )}

      <style>{`@keyframes learn-spin{to{transform:rotate(360deg)}}.learn-spin{animation:learn-spin 1s linear infinite}`}</style>
    </Card>
  );
}
