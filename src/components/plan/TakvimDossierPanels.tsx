"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Select, Skeleton, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import DossierProductionPanel, { type ProductionModel } from "./DossierProductionPanel";
import type { CalItem } from "./TakvimTab";

function DrawerField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: multiline ? 1.6 : 1.4, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}

export type AttachableDossier = {
  id: string;
  title: string;
  pillar: string;
  format: string;
  finalReadiness: string;
};

/**
 * Dossier'siz slot eylemleri (ADR-036 §H/§I → ADR-038 §F): İKİ yol —
 * (a) MEVCUT account-scoped dossier'i seçip bağla (yalnız local üretim değil),
 * (b) yeni dossier üret + bağla. Bağlama planlama eylemidir: API'nin
 * `productionReady` yanıtı dürüstçe gösterilir; "bağlandı" ≠ "yayına hazır".
 */
export function SlotDossierActions({
  accountId,
  slot,
  availableDossiers,
  onDone,
}: {
  accountId: string;
  slot: CalItem;
  availableDossiers: AttachableDossier[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState(slot.topicHint || slot.pillar || "");
  const [busy, setBusy] = useState(false);
  const [gateMissing, setGateMissing] = useState<string[] | null>(null);
  const [created, setCreated] = useState<{ dossierId: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [attachWarn, setAttachWarn] = useState<string | null>(null);

  const attach = async (dossierId: string) => {
    if (!slot.slotRawId) return;
    setBusy(true);
    setNote(null);
    setAttachWarn(null);
    try {
      const res = await fetch(`/api/reels/plan/slot/${encodeURIComponent(slot.slotRawId)}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, dossierId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.productionReady) {
          toast.success(json.alreadyAttached ? "Zaten bağlıydı." : "Dossier slota bağlandı — yayına hazır.");
        } else {
          toast.success(json.alreadyAttached ? "Zaten bağlıydı." : "Dossier slota bağlandı.");
          setAttachWarn(
            `Bağlandı ama YAYINA HAZIR DEĞİL${Array.isArray(json.blockers) && json.blockers.length > 0 ? ` (${(json.blockers as string[]).join(", ")})` : ""}.`
          );
        }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="slot-dossier-actions">
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
        Bu slota dossier bağlı değil{slot.pillar ? ` (sütun: ${slot.pillar})` : ""}. Bağlama bir
        PLANLAMA eylemidir — bağlanmış dossier ayrıca kanıt + editoryal + insan onayı kapılarını
        geçmeden yayına hazır sayılmaz.
      </p>

      {/* (a) Mevcut dossier'i bağla */}
      {availableDossiers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="slot-attach-existing">
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Mevcut dossier bağla
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Select
                aria-label="Mevcut dossier"
                data-testid="slot-existing-select"
                options={[
                  { value: "", label: "Dossier seç…" },
                  ...availableDossiers.map((d) => ({
                    value: d.id,
                    label: `${d.title.slice(0, 60)} (${d.format})`,
                  })),
                ]}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => attach(selectedId)} loading={busy} disabled={selectedId === ""} data-testid="slot-attach-existing-btn">
              Bağla
            </Button>
          </div>
        </div>
      )}

      {/* (b) Yeni üret + bağla */}
      {!created ? (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Yeni dossier — konu</span>
            <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} aria-label="Dossier konusu" data-testid="slot-topic" />
          </label>
          <div>
            <Button variant="secondary" size="sm" onClick={generate} loading={busy} disabled={topic.trim().length < 3} data-testid="slot-generate">
              Dossier hazırla
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button variant="primary" size="sm" onClick={() => attach(created.dossierId)} loading={busy} data-testid="slot-attach">
            Slota bağla
          </Button>
        </div>
      )}

      {attachWarn && (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }} data-testid="slot-attach-warning">
          {attachWarn}
        </p>
      )}
      {gateMissing && (
        <div data-testid="slot-gate-blocked" style={{ padding: "12px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>Canlı üretim kapısı kapalı</p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Eksik ortam değişkenleri: {gateMissing.join(", ")}. Kapı kapalıyken model/site çağrısı yapılmaz.
            Mevcut bir dossier bağlamak için kapı GEREKMEZ.
          </p>
        </div>
      )}
      {note && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}

type DossierDetail = {
  dossier: { id: string; title: string; updatedAt: string };
  content: {
    format: string;
    hook?: string;
    script?: string;
    voiceover?: string;
    caption: string;
    hashtags: string[];
    timeline?: unknown[];
    scenePlan?: unknown[];
    screenRecordingPlan?: unknown[];
  };
  creative: { status: string; issues: Array<{ code: string; message: string }> };
  approval: { approved: boolean };
  production: ProductionModel;
};

/**
 * Dossier tam detayı + production-state read model (ADR-038 §G). Katmanlar
 * ayrı: üretim çıktısı / kanıt / editoryal / onay / takvim. Bağlı slottan
 * açıldığında açık "bağlantıyı kaldır" eylemi sunar (dossier silinmez).
 */
export function DossierDetailPanel({
  accountId,
  dossierId,
  slotRawId,
  onDetached,
}: {
  accountId: string;
  dossierId: string;
  /** Bağlı slot bağlamından açıldıysa detach eylemi için slot id'si. */
  slotRawId?: string;
  onDetached?: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/reels/dossier/${encodeURIComponent(dossierId)}?accountId=${encodeURIComponent(accountId)}`
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setDetail(json);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, [accountId, dossierId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const detach = async () => {
    if (!slotRawId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reels/plan/slot/${encodeURIComponent(slotRawId)}/detach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, expectedDossierId: dossierId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Bağlantı kaldırıldı — dossier silinmedi, slot planlamaya döndü.");
        onDetached?.();
      } else {
        toast.error(json.error ?? "Bağlantı kaldırılamadı.");
      }
    } catch {
      toast.error("Bağlantı kaldırılamadı (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

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

      {/* Production-state read model — API ile AYNI kaynak */}
      <DossierProductionPanel
        accountId={accountId}
        dossierId={dossierId}
        updatedAt={detail.dossier.updatedAt}
        production={detail.production}
        onChanged={load}
      />

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

      {slotRawId && (
        <div style={{ paddingTop: 8, borderTop: "1px solid var(--border-faint)" }}>
          <Button size="sm" variant="ghost" onClick={detach} loading={busy} data-testid="slot-detach">
            Bağlantıyı kaldır (dossier silinmez)
          </Button>
        </div>
      )}
    </div>
  );
}
