"use client";

import { useState } from "react";
import { RefreshCw, Plus, Archive, ExternalLink, Wand2 } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

/**
 * Dossier production-state paneli (ADR-038 §G) — API'nin `production` read
 * model'ini AYNEN gösterir; istemci hiçbir readiness hesaplamaz/ezmez.
 *
 *  - Katman ayrımı: üretim / site kanıtı / alternatifler / editoryal /
 *    insan onayı / takvim — "bağlandı" ≠ "yayına hazır".
 *  - Unknown alanlar DÜRÜST "bilinmiyor" gösterilir: 451 kanıtı yoksa Türkiye
 *    erişimi iddia edilmez; Tier-2 render doğrulaması yok.
 *  - "Yeniden doğrula" force-refresh yapar (LLM yok, gate gerekmez).
 *  - Alternatif primary'yi sessizce değiştiremez: güvenli yol "bu araçla yeni
 *    dossier üret" (ADR-036 kapısına tabi — kapalıyken yalnız env adları).
 */

export type ProductionSignals = {
  signupRequired: boolean | "unknown";
  freeTier: boolean | "unknown";
  usageLimits: string | "unknown";
  regionRestricted: boolean | "unknown";
  lastUpdated: string | "unknown";
};

export type ProductionModel = {
  layers: {
    generation: { state: string };
    evidence: {
      state: "no_tool_required" | "ready" | "stale" | "missing" | "failed";
      verificationId: string | null;
      submittedUrl: string | null;
      finalUrl: string | null;
      redirectChain: string[];
      checkedAt: string | null;
      expiry: string | null;
      opens: boolean | null;
      urlMatchesTool: boolean | null;
      signals: ProductionSignals | null;
      reasons: string[];
    };
    alternatives: {
      items: Array<{
        id: string;
        name: string;
        submittedUrl: string;
        finalUrl: string | null;
        verificationId: string | null;
        evidenceState: "unverified" | "ready" | "stale" | "failed";
        checkedAt: string | null;
        expiry: string | null;
        status: "active" | "archived";
      }>;
      activeCount: number;
      parseFailed: boolean;
    };
    creative: { status: string; issues: Array<{ code: string; message: string }> };
    approval: { approved: boolean };
    seriesContract: { state: "none" | "valid" | "changed" };
    calendar: {
      attachedSlotCount: number;
      slots: Array<{ slotId: string; month: string; dayOfMonth: number; status: string }>;
      multiAttached: boolean;
    };
  };
  blockers: string[];
  productionReady: boolean;
  overall: string;
};

const EVIDENCE_STATE_META: Record<
  ProductionModel["layers"]["evidence"]["state"],
  { label: string; variant: "success" | "yellow" | "danger" | "muted" }
> = {
  no_tool_required: { label: "araç yok — kanıt gerekmiyor", variant: "muted" },
  ready: { label: "kanıt taze", variant: "success" },
  stale: { label: "kanıt bayat — yeniden doğrula", variant: "yellow" },
  missing: { label: "kalıcı kanıt yok", variant: "danger" },
  failed: { label: "doğrulama başarısız", variant: "danger" },
};

const ALT_STATE_META: Record<
  "unverified" | "ready" | "stale" | "failed",
  { label: string; variant: "success" | "yellow" | "danger" | "muted" }
> = {
  unverified: { label: "doğrulanmadı", variant: "muted" },
  ready: { label: "kanıt taze", variant: "success" },
  stale: { label: "bayat", variant: "yellow" },
  failed: { label: "açılmıyor", variant: "danger" },
};

const OVERALL_META: Record<string, { label: string; variant: "success" | "yellow" | "danger" | "muted" }> = {
  production_ready: { label: "YAYINA HAZIR", variant: "success" },
  approved: { label: "onaylı — slota bağlanabilir", variant: "success" },
  attached_not_ready: { label: "bağlı ama HAZIR DEĞİL", variant: "yellow" },
  awaiting_human_approval: { label: "insan onayı bekliyor", variant: "yellow" },
  creative_needs_edit: { label: "editoryal düzenleme gerek", variant: "yellow" },
  series_contract_changed: { label: "seri sözleşmesi değişti", variant: "danger" },
  evidence_stale: { label: "kanıt bayat", variant: "yellow" },
  evidence_missing: { label: "kanıt eksik", variant: "danger" },
  evidence_failed: { label: "kanıt başarısız", variant: "danger" },
};

function unknownText(v: boolean | string | "unknown", yes: string, no: string): string {
  if (v === "unknown") return "bilinmiyor";
  if (typeof v === "boolean") return v ? yes : no;
  return String(v);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR");
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default function DossierProductionPanel({
  accountId,
  dossierId,
  updatedAt,
  production,
  onChanged,
}: {
  accountId: string;
  dossierId: string;
  /** Optimistic concurrency için sunucudan gelen güncel updatedAt (ISO). */
  updatedAt: string;
  production: ProductionModel;
  /** Her başarılı mutasyon sonrası çağrılır — detay yeniden yüklenmeli. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [altName, setAltName] = useState("");
  const [altUrl, setAltUrl] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [gateMissing, setGateMissing] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const ev = production.layers.evidence;
  const evMeta = EVIDENCE_STATE_META[ev.state];
  const overall = OVERALL_META[production.overall] ?? { label: production.overall, variant: "muted" as const };

  const post = async (url: string, body: Record<string, unknown>): Promise<{ res: Response; json: Record<string, unknown> } | null> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      return { res, json };
    } catch {
      toast.error("İşlem başarısız (ağ hatası).");
      return null;
    }
  };

  const reverify = async (target?: { kind: "alternative"; alternativeId: string }) => {
    const key = target ? `alt-${target.alternativeId}` : "primary";
    setBusy(key);
    setNote(null);
    try {
      const r = await post(`/api/reels/dossier/${encodeURIComponent(dossierId)}/verify`, {
        accountId,
        expectedUpdatedAt: updatedAt,
        forceRefresh: true,
        ...(target ? { target } : {}),
      });
      if (!r) return;
      if (r.res.status === 409) {
        toast.error("Dossier bu arada değişti — yeniden yükleniyor.");
        onChanged();
        return;
      }
      if (!r.res.ok || !r.json.success) {
        setNote(String(r.json.error ?? "Doğrulama başarısız."));
        return;
      }
      const outcome = r.json.outcome as { status: string; code: string | null };
      if (outcome.status === "verified") {
        toast.success("Doğrulama tamamlandı — yeni kanıt snapshot'ı kaydedildi.");
      } else {
        toast.error(`Doğrulama başarısız (${outcome.code ?? "bilinmeyen"}) — eski kanıt korunuyor.`);
      }
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const addAlternative = async () => {
    if (altName.trim() === "" || altUrl.trim() === "") return;
    setBusy("alt-add");
    setNote(null);
    try {
      const r = await post(`/api/reels/dossier/${encodeURIComponent(dossierId)}/alternatives`, {
        op: "add",
        accountId,
        expectedUpdatedAt: updatedAt,
        name: altName.trim(),
        submittedUrl: altUrl.trim(),
      });
      if (!r) return;
      if (r.res.status === 409) {
        toast.error("Dossier bu arada değişti — yeniden yükleniyor.");
        onChanged();
        return;
      }
      if (!r.res.ok || !r.json.success) {
        setNote(String(r.json.error ?? "Alternatif eklenemedi."));
        return;
      }
      toast.success("Alternatif eklendi (doğrulanmamış başlar).");
      setAltName("");
      setAltUrl("");
      setAddOpen(false);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const archiveAlternative = async (alternativeId: string) => {
    setBusy(`alt-arch-${alternativeId}`);
    try {
      const r = await post(`/api/reels/dossier/${encodeURIComponent(dossierId)}/alternatives`, {
        op: "archive",
        accountId,
        expectedUpdatedAt: updatedAt,
        alternativeId,
      });
      if (!r) return;
      if (!r.res.ok || !r.json.success) {
        toast.error(String(r.json.error ?? "Arşivlenemedi."));
        if (r.res.status === 409) onChanged();
        return;
      }
      toast.success("Alternatif arşivlendi (silinmedi).");
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const newDossierFromAlternative = async (alt: { name: string; submittedUrl: string }) => {
    setBusy(`alt-new-${alt.submittedUrl}`);
    setGateMissing(null);
    setNote(null);
    try {
      const r = await post("/api/reels/dossier", {
        accountId,
        topic: `${alt.name} aracı tanıtımı`,
        toolName: alt.name,
        toolUrl: alt.submittedUrl,
        format: "reel",
      });
      if (!r) return;
      if (r.res.status === 422 && r.json.code === "generation_gate_closed") {
        setGateMissing((r.json.missing as string[]) ?? []);
        return;
      }
      if (!r.res.ok || !r.json.success) {
        setNote(String(r.json.error ?? "Yeni dossier üretilemedi."));
        return;
      }
      toast.success("Alternatif araçla yeni dossier üretildi — mevcut dossier DEĞİŞTİRİLMEDİ.");
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="dossier-production-panel">
      {/* Genel durum + checklist */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span data-testid="production-overall">
          <Badge variant={overall.variant} size="sm">{overall.label}</Badge>
        </span>
        {production.layers.calendar.attachedSlotCount > 0 && !production.productionReady && (
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
            bağlanmış olması yayına hazır olduğu anlamına gelmez
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="production-checklist">
        <ChecklistRow label="Üretim" ok note="dossier üretildi" />
        <ChecklistRow
          label="Site kanıtı"
          ok={ev.state === "ready" || ev.state === "no_tool_required"}
          warn={ev.state === "stale"}
          note={evMeta.label}
          testid="check-evidence"
        />
        <ChecklistRow
          label="Editoryal"
          ok={production.layers.creative.status === "ready_for_review"}
          note={
            production.layers.creative.status === "ready_for_review"
              ? "onaya hazır"
              : production.layers.creative.status === "blocked"
                ? "bloklu"
                : "düzenleme gerek"
          }
          testid="check-creative"
        />
        <ChecklistRow
          label="Seri sözleşmesi"
          ok={production.layers.seriesContract.state !== "changed"}
          note={
            production.layers.seriesContract.state === "none"
              ? "seri yok"
              : production.layers.seriesContract.state === "valid"
                ? "geçerli"
                : "üretimden sonra değişti — yeniden üret"
          }
        />
        <ChecklistRow
          label="İnsan onayı"
          ok={production.layers.approval.approved}
          note={production.layers.approval.approved ? "onaylı" : "bekliyor"}
          testid="check-approval"
        />
        <ChecklistRow
          label="Takvim"
          ok={production.layers.calendar.attachedSlotCount === 1}
          warn={production.layers.calendar.attachedSlotCount === 0}
          note={
            production.layers.calendar.multiAttached
              ? `⚠ ${production.layers.calendar.attachedSlotCount} slota bağlı — tekilleştir`
              : production.layers.calendar.attachedSlotCount === 1
                ? `slot: ${production.layers.calendar.slots[0]?.month} / gün ${production.layers.calendar.slots[0]?.dayOfMonth}`
                : "slota bağlı değil"
          }
          testid="check-calendar"
        />
      </div>

      {/* Kanıt kartı */}
      {ev.state !== "no_tool_required" && (
        <div
          data-testid="evidence-card"
          style={{ padding: "12px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)" }}>Site kanıtı</span>
            <Badge variant={evMeta.variant} size="sm">{evMeta.label}</Badge>
            <span style={{ marginLeft: "auto" }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => reverify()}
                loading={busy === "primary"}
                iconLeft={<RefreshCw size={13} strokeWidth={2} />}
                data-testid="evidence-reverify"
              >
                Yeniden doğrula
              </Button>
            </span>
          </div>
          <Row label="Girilen URL" value={ev.submittedUrl ?? "—"} />
          <Row label="Final URL" value={ev.finalUrl ?? "—"} />
          <Row
            label="Redirect"
            value={ev.redirectChain.length === 0 ? "yok" : `${ev.redirectChain.length} hop: ${ev.redirectChain.join(" → ")}`}
          />
          <Row label="Son kontrol" value={fmtDate(ev.checkedAt)} />
          <Row label="Kanıt geçerlilik" value={fmtDate(ev.expiry)} />
          {ev.urlMatchesTool === false && (
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--status-danger-text, #f66)" }}>
              Kanıt farklı bir URL için — bu araca ait sayılmaz.
            </p>
          )}
          <div style={{ height: 1, background: "var(--border-faint)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="evidence-signals">
            <Row label="Kayıt gerekli mi" value={ev.signals ? unknownText(ev.signals.signupRequired, "evet", "hayır") : "bilinmiyor"} />
            <Row label="Ücretsiz katman" value={ev.signals ? unknownText(ev.signals.freeTier, "var", "yok") : "bilinmiyor"} />
            <Row label="Kullanım limiti" value={ev.signals ? unknownText(ev.signals.usageLimits, "", "") : "bilinmiyor"} />
            <Row
              label="Türkiye erişimi"
              value={
                ev.signals?.regionRestricted === true
                  ? "engelli (451 kanıtı)"
                  : "bilinmiyor — HTTP 2xx erişim kanıtı DEĞİLDİR"
              }
            />
          </div>
          <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Tier-1 HTTP kanıtı: sayfa render edilmedi, ekran görüntüsü alınmadı. Bilinmeyen alanlar
            &quot;bilinmiyor&quot; kalır; tahmin üretilmez.
          </p>
        </div>
      )}

      {/* Alternatif araç zinciri */}
      <div data-testid="alternatives-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="eyebrow" style={{ color: "var(--text-muted)" }}>Alternatif araçlar</span>
          <span style={{ marginLeft: "auto" }}>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen((v) => !v)} iconLeft={<Plus size={13} strokeWidth={2} />} data-testid="alt-add-open">
              Alternatif ekle
            </Button>
          </span>
        </div>
        {production.layers.alternatives.parseFailed && (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            Kayıtlı alternatif verisi okunamadı (eski format) — liste boş gösteriliyor.
          </p>
        )}
        {addOpen && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="alt-add-form">
            <div style={{ flex: 1, minWidth: 120 }}>
              <Input value={altName} onChange={(e) => setAltName(e.target.value)} placeholder="Araç adı" aria-label="Alternatif araç adı" data-testid="alt-name" />
            </div>
            <div style={{ flex: 2, minWidth: 180 }}>
              <Input value={altUrl} onChange={(e) => setAltUrl(e.target.value)} placeholder="https://…" aria-label="Alternatif araç URL" data-testid="alt-url" />
            </div>
            <Button size="sm" variant="primary" onClick={addAlternative} loading={busy === "alt-add"} disabled={altName.trim() === "" || altUrl.trim() === ""} data-testid="alt-add-save">
              Ekle
            </Button>
          </div>
        )}
        {production.layers.alternatives.items.filter((a) => a.status === "active").length === 0 && !addOpen ? (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Alternatif yok. Primary araç çökerse buradan doğrulanmış yedek eklenir.
          </span>
        ) : (
          production.layers.alternatives.items
            .filter((a) => a.status === "active")
            .map((a) => {
              const meta = ALT_STATE_META[a.evidenceState];
              return (
                <div
                  key={a.id}
                  data-testid={`alt-row-${a.id}`}
                  style={{ padding: "10px 12px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>{a.name}</span>
                    <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                    {a.checkedAt && (
                      <span className="tnum" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                        kontrol: {fmtDate(a.checkedAt)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <ExternalLink size={11} /> {a.submittedUrl}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button size="sm" variant="secondary" onClick={() => reverify({ kind: "alternative", alternativeId: a.id })} loading={busy === `alt-${a.id}`} iconLeft={<RefreshCw size={12} strokeWidth={2} />} data-testid={`alt-verify-${a.id}`}>
                      Doğrula
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => newDossierFromAlternative(a)} loading={busy === `alt-new-${a.submittedUrl}`} iconLeft={<Wand2 size={12} strokeWidth={2} />} data-testid={`alt-new-dossier-${a.id}`}>
                      Bu araçla yeni dossier
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archiveAlternative(a.id)} loading={busy === `alt-arch-${a.id}`} iconLeft={<Archive size={12} strokeWidth={2} />} data-testid={`alt-archive-${a.id}`}>
                      Arşivle
                    </Button>
                  </div>
                </div>
              );
            })
        )}
        <p style={{ margin: 0, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Alternatif primary&apos;nin yerine SESSİZCE geçmez: mevcut script eski aracı anlatabilir.
          Güvenli yol alternatifle YENİ dossier üretmektir.
        </p>
      </div>

      {gateMissing && (
        <div data-testid="production-gate-blocked" style={{ padding: "12px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>Canlı üretim kapısı kapalı</p>
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Eksik ortam değişkenleri: {gateMissing.join(", ")}. Kapı kapalıyken model/site çağrısı yapılmaz;
            mevcut dossier değiştirilmedi.
          </p>
        </div>
      )}
      {note && <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }} data-testid="production-note">{note}</p>}
    </div>
  );
}

function ChecklistRow({
  label,
  ok,
  warn,
  note,
  testid,
}: {
  label: string;
  ok: boolean;
  warn?: boolean;
  note: string;
  testid?: string;
}) {
  const color = ok
    ? "var(--status-success-text, #7fbf7f)"
    : warn
      ? "var(--status-warn-text, #d9a94a)"
      : "var(--status-danger-text, #f66)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid={testid}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "var(--radius-pill)", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)", minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{note}</span>
    </div>
  );
}
