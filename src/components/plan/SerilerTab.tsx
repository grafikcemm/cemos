"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dna, Sprout, Pencil, History, ArrowRight } from "lucide-react";
import {
  Card,
  SectionHeader,
  EmptyState,
  ErrorState,
  Badge,
  Button,
  Skeleton,
  Drawer,
  Input,
  Textarea,
} from "@/components/ui";
import { useAccounts } from "./useAccounts";

/**
 * Plan / Seriler (05 §C3) — Carousel/Reels seri DNA'sı. Kullanıcı DNA'yı görür ve
 * düzenler; kaydetmek = SÜRÜM ARTIŞI = insan onayı (motor yeni sürümü kullanır).
 * Bare host: başlık + SubNav shell'de (AppShell). Gövde-only.
 *
 * Provenance: PUT provenance'ı değiştirmez (operatör onaylı kalır); "insan
 * onayı" açık Kaydet eylemidir. Meta izni yoksa yol yine manuel DNA editörüdür.
 */

type SeriesRow = {
  id: string;
  accountId: string;
  seriesKey: string;
  name: string;
  platform: string;
  format: string;
  purpose: string;
  audience: string;
  objective: string;
  slideCountRange: string;
  coverFormula: string;
  ctaFormula: string;
  slideArchetypesJson: string;
  variableElementsJson: string;
  bannedRepetitionJson: string;
  captionDnaJson: string;
  hashtagDnaJson: string;
  pastTopicsJson: string;
  isActive: boolean;
  version: number;
  promptVersion: string;
};

type EditableKey =
  | "purpose"
  | "audience"
  | "objective"
  | "slideCountRange"
  | "coverFormula"
  | "ctaFormula"
  | "slideArchetypesJson"
  | "variableElementsJson"
  | "bannedRepetitionJson";

const FIELDS: Array<{ key: EditableKey; label: string; multiline?: boolean; json?: boolean }> = [
  { key: "purpose", label: "Amaç" },
  { key: "audience", label: "Kitle" },
  { key: "objective", label: "Hedef aksiyon (save/follow/share/profile_visit)" },
  { key: "slideCountRange", label: "Slayt sayısı aralığı" },
  { key: "coverFormula", label: "Kapak formülü", multiline: true },
  { key: "ctaFormula", label: "Caption / CTA formülü", multiline: true },
  { key: "slideArchetypesJson", label: "Slayt arketipleri (JSON dizi)", multiline: true, json: true },
  { key: "variableElementsJson", label: "Her bölümde değişmesi zorunlu (JSON dizi)", multiline: true, json: true },
  { key: "bannedRepetitionJson", label: "Tekrar yasakları (JSON dizi)", multiline: true, json: true },
];

/** JSON-string diziyi savunmacı biçimde etiket listesine çevirir. */
export function parseSeriesList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x) =>
        typeof x === "string"
          ? x
          : x && typeof x === "object"
            ? String((x as Record<string, unknown>).label ?? (x as Record<string, unknown>).name ?? (x as Record<string, unknown>).title ?? "")
            : "",
      )
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

function metaChip(label: string, value: string) {
  if (!value) return null;
  return (
    <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label} </span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </span>
  );
}

function ChipRow({ items, tone = "muted" }: { items: string[]; tone?: "muted" | "accent" }) {
  if (items.length === 0) return <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((c, i) => (
        <Badge key={`${c}-${i}`} variant={tone} size="sm">
          {c}
        </Badge>
      ))}
    </div>
  );
}

export default function SerilerTab() {
  const { accounts } = useAccounts();
  const [series, setSeries] = useState<SeriesRow[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<EditableKey, string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/series");
      if (!res.ok) throw new Error("http");
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      const rows: SeriesRow[] = json.series ?? [];
      setSeries(rows);
      setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? "")));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => (series ?? []).find((s) => s.id === selectedId) ?? null, [series, selectedId]);

  const seed = async () => {
    setBusy(true);
    setNote(null);
    try {
      const accountId = accounts[0]?.id;
      if (!accountId) {
        setNote("Hesap bulunamadı — önce hesap kurulmalı.");
        return;
      }
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", accountId }),
      });
      const json = await res.json();
      setNote(
        res.ok && json.success
          ? json.created
            ? "Best AI Tools serisi eklendi."
            : "Bu seri zaten mevcut."
          : (json.error ?? "Seri eklenemedi"),
      );
      await load();
    } catch {
      setNote("Seri eklenemedi (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    setDraft({});
    setNote(null);
    setEditOpen(true);
  };

  const save = async () => {
    if (!selected || Object.keys(draft).length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/series", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, ...draft }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNote(`Onaylandı — yeni sürüm v${json.version} (motor bu sürümü kullanır).`);
        setDraft({});
        setEditOpen(false);
        await load();
      } else {
        setNote(json.error ?? "Kaydedilemedi.");
      }
    } catch {
      setNote("Kaydedilemedi (ağ hatası).");
    } finally {
      setBusy(false);
    }
  };

  // ── Durumlar ──
  if (loading) {
    return (
      <Card variant="feature" padded>
        <div aria-busy="true" aria-label="Seriler yükleniyor">
          <Skeleton width={200} height={14} style={{ marginBottom: "var(--space-4)" }} />
          <Skeleton lines={5} />
        </div>
      </Card>
    );
  }
  if (failed) {
    return (
      <ErrorState
        title="Seriler alınamadı"
        description="Seri DNA verisi getirilemedi. Bağlantını kontrol edip yeniden dene."
        onRetry={load}
      />
    );
  }
  if ((series ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Dna size={22} strokeWidth={1.8} />}
        title="Henüz seri yok"
        description="İlk seri DNA'sını ekleyerek başla. Meta izni yoksa DNA'yı manuel de girebilirsin — kapak formülü, slide arketipleri ve tekrar yasakları elle tanımlanır."
        action={
          <Button variant="primary" onClick={seed} loading={busy} iconLeft={<Sprout size={15} strokeWidth={2} />}>
            Best AI Tools serisini ekle
          </Button>
        }
      />
    );
  }

  const archetypes = selected ? parseSeriesList(selected.slideArchetypesJson) : [];
  const hashtags = selected ? parseSeriesList(selected.hashtagDnaJson) : [];
  const banned = selected ? parseSeriesList(selected.bannedRepetitionJson) : [];
  const pastTopics = selected ? parseSeriesList(selected.pastTopicsJson) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
      {/* Seri seçici + ekle (toolbar, nav değil) */}
      <Card variant="quiet" padded>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--text-muted)" }}>
            Seriler
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
            {(series ?? []).map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  aria-pressed={active}
                  data-testid={`series-pill-${s.seriesKey}`}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
                    background: active ? "var(--accent-dark)" : "transparent",
                    color: active ? "var(--accent-text)" : "var(--text-secondary)",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <Button size="sm" variant="secondary" onClick={seed} loading={busy} iconLeft={<Sprout size={14} strokeWidth={2} />}>
            Seri ekle
          </Button>
        </div>
        {note && (
          <p style={{ margin: "10px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</p>
        )}
      </Card>

      {/* DNA kartı */}
      {selected && (
        <Card variant="feature" padded>
          {/* Başlık satırı */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2
                className="font-display"
                style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em" }}
              >
                {selected.name}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                {selected.format === "carousel" ? "Carousel serisi" : selected.format} · {selected.platform}
                {pastTopics.length > 0 ? ` · ${pastTopics.length} bölüm geçmişi` : ""}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Badge variant="muted" size="sm">{selected.format}</Badge>
              <Badge variant={selected.isActive ? "success" : "muted"} size="sm">
                {selected.isActive ? "aktif" : "pasif"}
              </Badge>
              <Badge variant="accent" size="sm">v{selected.version}</Badge>
            </div>
          </div>

          {/* Meta satırı */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 16 }}>
            {metaChip("amaç", selected.purpose)}
            {metaChip("kitle", selected.audience)}
            {metaChip("hedef", selected.objective)}
            {metaChip("uzunluk", selected.slideCountRange)}
          </div>

          <div style={{ height: 1, background: "var(--border-faint)", margin: "20px 0" }} />

          {/* Kapak formülü */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
              Kapak formülü
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)", lineHeight: 1.6 }}>
              {selected.coverFormula || "—"}
            </p>
          </div>

          {/* Slide arketipleri */}
          <div style={{ marginBottom: 20 }}>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
              Slide arketipleri
            </div>
            {archetypes.length === 0 ? (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>—</span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {archetypes.map((a, i) => (
                  <span key={`${a}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Badge variant={i === 0 || i === archetypes.length - 1 ? "accent" : "muted"} size="sm">
                      {a}
                    </Badge>
                    {i < archetypes.length - 1 && <ArrowRight size={13} style={{ color: "var(--text-faint)" }} />}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border-faint)", margin: "20px 0" }} />

          {/* Caption + Hashtag (2 kolon) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 24 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                Caption formülü
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6 }}>
                {selected.ctaFormula || "—"}
              </p>
            </div>
            <div>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                Hashtag grupları
              </div>
              <ChipRow items={hashtags} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border-faint)", margin: "20px 0" }} />

          {/* Tekrar yasakları + Geçmiş (2 kolon) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 24 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                Tekrar yasakları
              </div>
              <ChipRow items={banned} />
            </div>
            <div>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                Bölüm geçmişi
              </div>
              {pastTopics.length === 0 ? (
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                  Geçmiş performans verisi henüz yok.
                </span>
              ) : (
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  {pastTopics.length} bölüm kaydı — tekrar histogramı için kullanılır.
                </span>
              )}
            </div>
          </div>

          {/* Footer: provenance + eylemler */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid var(--border-faint)",
            }}
          >
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Kaynak: operatör onaylı · DNA değişikliği insan onayı olmadan kalıcılaşmaz.
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setHistoryOpen(true)}
                iconLeft={<History size={14} strokeWidth={2} />}
                disabled={pastTopics.length === 0}
              >
                Bölüm geçmişi
              </Button>
              <Button size="sm" variant="primary" onClick={openEdit} iconLeft={<Pencil size={14} strokeWidth={2} />} data-testid="series-edit-open">
                DNA'yı düzenle
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Düzenleme drawer'ı */}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title={selected ? `${selected.name} — DNA düzenle` : "DNA düzenle"} width={560}>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              Kaydetmek yeni bir sürüm oluşturur (v{selected.version} → v{selected.version + 1}). Bu <strong>insan onayıdır</strong>;
              onaylanmadan motor eski sürümü kullanmaya devam eder.
            </p>
            {FIELDS.map((f) => {
              const value = draft[f.key] ?? ((selected[f.key] as string) ?? "");
              return (
                <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {f.label}
                  </span>
                  {f.multiline ? (
                    <Textarea
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      rows={f.json ? 4 : 3}
                      aria-label={f.label}
                      style={f.json ? { fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" } : undefined}
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      aria-label={f.label}
                    />
                  )}
                </label>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <Button variant="primary" onClick={save} loading={busy} disabled={Object.keys(draft).length === 0} data-testid="series-save">
                Onayla ve kaydet (v{selected.version + 1})
              </Button>
              <Button variant="ghost" onClick={() => setEditOpen(false)}>
                Vazgeç
              </Button>
              {note && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{note}</span>}
            </div>
          </div>
        )}
      </Drawer>

      {/* Bölüm geçmişi drawer'ı */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Bölüm geçmişi" width={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pastTopics.length === 0 ? (
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Kayıtlı bölüm yok.</span>
          ) : (
            pastTopics.map((t, i) => (
              <div
                key={`${t}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-faint)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", minWidth: 22 }}>
                  #{i + 1}
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{t}</span>
              </div>
            ))
          )}
        </div>
      </Drawer>
    </div>
  );
}
