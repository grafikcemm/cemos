"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Skeleton, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type { CalItem } from "./TakvimTab";

function DrawerField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: multiline ? 1.6 : 1.4, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}

/**
 * Dossier'siz slot eylemleri (ADR-036 §H/§I): "Dossier hazırla" + üretim
 * sonrası AÇIK kullanıcı eylemiyle "Slota bağla". Kapı kapalıyken dürüst
 * blocked (yalnız ENV adları); slot sahte "hazır" görünmez.
 */
export function SlotDossierActions({
  accountId,
  slot,
  onDone,
}: {
  accountId: string;
  slot: CalItem;
  onDone: () => void;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState(slot.topicHint || slot.pillar || "");
  const [busy, setBusy] = useState(false);
  const [gateMissing, setGateMissing] = useState<string[] | null>(null);
  const [created, setCreated] = useState<{ dossierId: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const generate = async () => {
    if (!accountId || topic.trim().length < 3) return;
    setBusy(true);
    setGateMissing(null);
    setNote(null);
    try {
      const res = await fetch("/api/reels/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          topic: topic.trim(),
          format: "reel",
          seriesKey: slot.seriesKey ?? undefined,
        }),
      });
      const json = await res.json();
      if (res.status === 422 && json.code === "generation_gate_closed") {
        setGateMissing(json.missing ?? []);
        return;
      }
      if (!res.ok || !json.success) {
        setNote(json.error ?? "Dossier üretilemedi.");
        return;
      }
      setCreated({ dossierId: json.dossierId });
      toast.success("Dossier üretildi — slota bağlamak için onayla.");
    } catch {
      setNote("Dossier üretilemedi (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (!created || !slot.slotRawId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reels/plan/slot/${encodeURIComponent(slot.slotRawId)}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, dossierId: created.dossierId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.alreadyAttached ? "Zaten bağlıydı." : "Dossier slota bağlandı.");
        onDone();
      } else {
        setNote(json.error ?? "Bağlanamadı.");
      }
    } catch {
      setNote("Bağlanamadı (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="slot-dossier-actions">
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
        Bu slot için dossier üretilmedi{slot.pillar ? ` (sütun: ${slot.pillar})` : ""}. Üretim ve
        slota bağlama iki AYRI açık eylemdir — bağlanmadan slot &quot;hazır&quot; sayılmaz.
      </p>
      {!created ? (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Konu</span>
            <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} aria-label="Dossier konusu" data-testid="slot-topic" />
          </label>
          <div>
            <Button variant="primary" size="sm" onClick={generate} loading={busy} disabled={topic.trim().length < 3} data-testid="slot-generate">
              Dossier hazırla
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="primary" size="sm" onClick={attach} loading={busy} data-testid="slot-attach">
            Slota bağla
          </Button>
        </div>
      )}
      {gateMissing && (
        <div data-testid="slot-gate-blocked" style={{ padding: "12px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>Canlı üretim kapısı kapalı</p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Eksik ortam değişkenleri: {gateMissing.join(", ")}. Kapı kapalıyken model/site çağrısı yapılmaz.
          </p>
        </div>
      )}
      {note && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}

/** Dossier tam detayı + editoryal/onay durumu (üç durum ayrımı — ADR-036 §E). */
export function DossierDetailPanel({ accountId, dossierId }: { accountId: string; dossierId: string }) {
  const [detail, setDetail] = useState<{
    content: { format: string; hook?: string; script?: string; voiceover?: string; caption: string; hashtags: string[]; timeline?: unknown[]; scenePlan?: unknown[]; screenRecordingPlan?: unknown[] };
    creative: { status: string; issues: Array<{ message: string }> };
    approval: { approved: boolean };
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reels/dossier/${encodeURIComponent(dossierId)}?accountId=${encodeURIComponent(accountId)}`);
        const json = await res.json();
        if (!cancelled) {
          if (res.ok && json.success) setDetail(json);
          else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, dossierId]);

  if (failed) return <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Detay yüklenemedi.</p>;
  if (!detail) return <Skeleton lines={3} />;

  const c = detail.content;
  const creativeMeta =
    detail.creative.status === "ready_for_review"
      ? { label: "onaya hazır", variant: "success" as const }
      : detail.creative.status === "blocked"
        ? { label: "bloklu", variant: "danger" as const }
        : { label: "düzenleme gerek", variant: "yellow" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="dossier-detail-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Badge variant={creativeMeta.variant} size="sm">editoryal: {creativeMeta.label}</Badge>
        <Badge variant={detail.approval.approved ? "success" : "muted"} size="sm">
          {detail.approval.approved ? "insan onaylı" : "onay bekliyor"}
        </Badge>
      </div>
      {c.script && <DrawerField label="Senaryo" value={c.script} multiline />}
      {c.voiceover && <DrawerField label="Voiceover" value={c.voiceover} multiline />}
      {Array.isArray(c.timeline) && c.timeline.length > 0 && (
        <DrawerField label="Timeline" value={`${c.timeline.length} adım`} />
      )}
      {Array.isArray(c.scenePlan) && c.scenePlan.length > 0 && (
        <DrawerField label="Sahne planı" value={`${c.scenePlan.length} sahne`} />
      )}
      {Array.isArray(c.screenRecordingPlan) && c.screenRecordingPlan.length > 0 && (
        <DrawerField label="Ekran kaydı planı" value={`${c.screenRecordingPlan.length} adım`} />
      )}
      <DrawerField label="Caption" value={c.caption || "—"} multiline />
      {c.hashtags.length > 0 && <DrawerField label="Hashtag'ler" value={c.hashtags.join(" ")} />}
      {detail.creative.issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {detail.creative.issues.map((i, idx) => (
            <li key={idx} style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
