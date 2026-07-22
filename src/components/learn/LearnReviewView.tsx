"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, Button, Badge, Skeleton, EmptyState } from "@/components/ui";

type SessionItem = {
  itemId: string;
  kind: string;
  front: string;
  back: string;
  options: string[];
  correctIdx: number | null;
  difficulty: number;
  conceptLabel: string | null;
};

// Date.now() modül kapsamında — react-hooks/purity render içinde impure çağrıyı engeller.
const nowMs = (): number => Date.now();

// Attempt idempotency anahtarı (4C-H) — event handler'da üretilir, çift-gönderimde aynı kalır.
const newKey = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${nowMs()}-${Math.round(Math.random() * 1e9)}`;

const GRADES: { grade: 0 | 1 | 2 | 3; label: string; variant: "ghost" | "secondary" | "primary" }[] = [
  { grade: 0, label: "Tekrar", variant: "ghost" },
  { grade: 1, label: "Zor", variant: "secondary" },
  { grade: 2, label: "İyi", variant: "secondary" },
  { grade: 3, label: "Kolay", variant: "primary" },
];

export default function LearnReviewView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [graded, setGraded] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false); // senkron çift-tık guard (setState async)
  const attemptKeyRef = useRef<string | null>(null); // kart başına idempotency key

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/learn/review?limit=15");
      const json = await res.json();
      if (!cancelled) {
        setItems(json.success ? json.items : []);
        setStartedAt(nowMs());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = items[idx];

  async function submit(grade: 0 | 1 | 2 | 3) {
    if (!current || submittingRef.current) return; // senkron guard: çift-tık ikinci POST'u engeller
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    if (!attemptKeyRef.current) attemptKeyRef.current = newKey(); // bu kart için tek key (retry aynı key)
    const correct =
      current.kind === "quiz_mcq" && current.correctIdx !== null ? selected === current.correctIdx : grade > 0;
    try {
      const res = await fetch("/api/learn/review/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: current.itemId,
          grade,
          responseMs: Math.min(3_600_000, nowMs() - startedAt),
          correct,
          idempotencyKey: attemptKeyRef.current,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError("Cevap kaydedilemedi. Tekrar dene."); // POST hatası → İLERLEME YOK
        return;
      }
      // Başarı → sonraki kart (yeni key).
      attemptKeyRef.current = null;
      setGraded((g) => g + 1);
      setIdx((i) => i + 1);
      setRevealed(false);
      setSelected(null);
      setStartedAt(nowMs());
    } catch {
      setSubmitError("Ağ hatası. Cevap kaydedilemedi, tekrar dene.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <Card variant="feature" padded>
        <Skeleton lines={4} height={18} />
      </Card>
    );

  if (items.length === 0)
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} iconLeft={<ArrowLeft size={15} strokeWidth={2} />}>
          Geri
        </Button>
        <Card variant="feature" padded style={{ marginTop: "var(--space-3)" }}>
          <EmptyState icon={<CheckCircle2 size={22} strokeWidth={1.8} />} title="Bugün tekrar yok" description="Şu an due olan kart yok. Yarın tekrar gel." />
        </Card>
      </div>
    );

  if (idx >= items.length)
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} iconLeft={<ArrowLeft size={15} strokeWidth={2} />}>
          Geri
        </Button>
        <Card variant="feature" padded style={{ marginTop: "var(--space-3)" }}>
          <EmptyState
            icon={<CheckCircle2 size={22} strokeWidth={1.8} style={{ color: "var(--green)" }} />}
            title="Oturum tamamlandı"
            description={`${graded} kart cevaplandı. Mastery skorların güncellendi.`}
            action={
              <Button variant="primary" size="sm" onClick={onBack}>
                Panele dön
              </Button>
            }
          />
        </Card>
      </div>
    );

  const isQuiz = current.kind === "quiz_mcq";

  return (
    <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-3)" }}>
        <Button variant="ghost" size="sm" onClick={onBack} iconLeft={<ArrowLeft size={15} strokeWidth={2} />}>
          Çıkış
        </Button>
        <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${(idx / items.length) * 100}%`, height: "100%", background: "var(--accent)" }} />
        </div>
        <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {idx + 1}/{items.length}
        </span>
      </div>

      <Card variant="feature" padded>
        {current.conceptLabel && (
          <div style={{ marginBottom: 10 }}>
            <Badge variant="muted" size="xs">
              {current.conceptLabel}
            </Badge>
          </div>
        )}
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "var(--space-4)" }}>
          {current.front}
        </div>

        {isQuiz ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {current.options.map((o, i) => {
              const chosen = selected === i;
              const showResult = revealed;
              const isCorrect = i === current.correctIdx;
              const color = showResult
                ? isCorrect
                  ? "var(--green)"
                  : chosen
                    ? "var(--danger)"
                    : "var(--text-secondary)"
                : "var(--text-primary)";
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (revealed) return;
                    setSelected(i);
                    setRevealed(true);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${chosen ? "var(--accent)" : "var(--border)"}`,
                    background: chosen ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--bg-elevated)",
                    color,
                    fontFamily: "inherit",
                    fontSize: "var(--text-sm)",
                    cursor: revealed ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {showResult && isCorrect && <CheckCircle2 size={15} strokeWidth={2} style={{ color: "var(--green)" }} />}
                  {showResult && chosen && !isCorrect && <XCircle size={15} strokeWidth={2} style={{ color: "var(--danger)" }} />}
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
        ) : (
          revealed && (
            <div
              style={{
                fontSize: "var(--text-base)",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--border)",
              }}
            >
              {current.back}
            </div>
          )
        )}

        {revealed && isQuiz && current.back && (
          <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{current.back}</div>
        )}

        <div style={{ marginTop: "var(--space-5)" }}>
          {!revealed ? (
            <Button variant="primary" size="md" onClick={() => setRevealed(true)} style={{ width: "100%" }}>
              Cevabı göster
            </Button>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                {GRADES.map((g) => (
                  <Button key={g.grade} variant={g.variant} size="sm" onClick={() => submit(g.grade)} disabled={submitting} style={{ flex: 1 }}>
                    {g.label}
                  </Button>
                ))}
              </div>
              {submitError && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--danger)" }}>
                  <AlertTriangle size={13} strokeWidth={2} />
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
