"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Check, X, Undo2, RefreshCw, Plus, ListTree, Pencil, HandMetal, Ban, TrendingUp } from "lucide-react";
import LearningStatusCard from "@/components/LearningStatusCard";
import {
  PageHeader,
  Card,
  EmptyState,
  ErrorState,
  Badge,
  Button,
  Select,
  Input,
  Textarea,
  Skeleton,
  Drawer,
  MetricStrip,
  type MetricStripItem,
} from "@/components/ui";
import { useAccounts } from "@/components/plan/useAccounts";

/**
 * Profil / CemOS'un bildikleri (05 §G1 + Faz 2B ADR-029/030) — kaynaklı hafıza
 * görünümü. Bağlayıcı sözleşme:
 *  - ONAYLANMAMIŞ ÖNERİLER TASLAKLARI ETKİLEMEZ.
 *  - Öğrenilmiş öneri <3 kaynaklı kanıtla ONAYLANAMAZ (buton disabled + server
 *    fail-closed); operatör "Sahiplen" ile açıkça üstlenebilir.
 *  - Aktif kural düzenlemesi yerinde overwrite DEĞİL — yeni superseding sürüm.
 *  - Performans dersleri (validated ViralPattern) identity kurallarından AYRI
 *    bölümdür; identity fact'ine kopyalanmaz.
 *  - Kaynaksız eski kayıt dürüstçe "eski kayıt · kaynak ayrıntısı yok".
 */

type EvidenceRow = {
  id: string;
  sourceType: string;
  signalType: string;
  direction: string;
  excerpt: string;
  observedAt: string;
  sourceAvailable: boolean;
  metadataInvalid: boolean;
};

type FactRow = {
  id: string;
  statement: string;
  type: string;
  status: string;
  sourceProvenance: string;
  createdBy: string;
  confidence: number;
  evidenceCount: number;
  sourcedEvidenceCount: number;
  legacyUnattributed: boolean;
  reviewReady: boolean;
  influencesDrafts: boolean;
  supersedesId: string | null;
  createdAt: string;
  evidence: EvidenceRow[];
};

type Lesson = {
  id: string;
  patternName: string;
  hookType: string | null;
  emotion: string;
  platform: string;
  validatedAt: string;
  validatedSupport: number;
};

type CandidatePattern = {
  id: string;
  patternName: string;
  hookType: string | null;
  emotion: string;
  platform: string;
  successScore: number;
  usageCount: number;
};

type SignalRow = {
  id: string;
  feedbackType: string;
  createdAt: string;
  mechanical: boolean;
  reasonExcerpt: string | null;
  editDistance: number | null;
  hasEdit: boolean;
  neutralized: boolean;
};

type Knowledge = {
  accountHandle: string;
  summary: string;
  activeFacts: FactRow[];
  proposals: FactRow[];
  performanceLessons: Lesson[];
  candidatePatterns: CandidatePattern[];
  trainingCorpus: { total: number; good: number; bad: number; edited: number };
  recentSignals: { counts: Record<string, number>; neutralizedCount: number; latest: SignalRow[] };
  policy: { promotionMinEvidence: number; note: string };
  sectionErrors: string[];
};

const TYPE_LABELS: Record<string, string> = {
  preference: "tercih",
  semantic: "öğrenilmiş",
  procedural: "yazım kuralı",
};

const SOURCE_LABELS: Record<string, string> = {
  feedback_event: "geri bildirim",
  operator_assertion: "operatör beyanı",
  operator_revision: "operatör düzenlemesi",
  validated_pattern: "doğrulanmış pattern",
  legacy_unattributed: "eski kayıt",
};

const SIGNAL_LABELS: Record<string, string> = {
  not_my_tone: "Ton Dışı",
  hook_weak: "Hook Zayıf",
  too_ai: "Fazla AI",
  make_stronger: "Güçlendir",
  make_clearer: "Netleştir",
  explicit_reason: "açık gerekçe",
  approved: "onaylandı",
  rejected: "reddedildi",
  edited: "düzenlendi",
  engagement_high: "yüksek etkileşim",
  engagement_low: "düşük etkileşim",
};

function dateLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export default function ProfileMemoryTab() {
  const { accounts } = useAccounts();
  const [accountHandle, setAccountHandle] = useState("grafikcem");
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newStatement, setNewStatement] = useState("");
  const [newType, setNewType] = useState("preference");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Drawer: kanıt detayı ya da düzenleme.
  const [drawerFact, setDrawerFact] = useState<FactRow | null>(null);
  const [drawerMode, setDrawerMode] = useState<"evidence" | "revise">("evidence");
  const [reviseText, setReviseText] = useState("");
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.handle === accountHandle)) {
      setAccountHandle(accounts[0].handle);
    }
  }, [accounts, accountHandle]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/memory/knowledge?accountHandle=${encodeURIComponent(accountHandle)}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      setKnowledge(json.knowledge ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountHandle]);

  useEffect(() => {
    load();
  }, [load]);

  const accountOptions =
    accounts.length > 0
      ? accounts.map((a) => ({ value: a.handle, label: `@${a.handle}` }))
      : [
          { value: "grafikcem", label: "@grafikcem" },
          { value: "maskulenkod", label: "@maskulenkod" },
        ];

  const addFact = async () => {
    const statement = newStatement.trim();
    if (statement.length < 5) {
      setAddError("Kural en az 5 karakter olmalı.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", accountHandle, type: newType, statement }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || String(res.status));
      setNewStatement("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Kural eklenemedi.");
    } finally {
      setAdding(false);
    }
  };

  const act = async (action: "approve" | "adopt" | "reject" | "rollback", factId: string) => {
    setBusyId(factId);
    setActionError(null);
    try {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, factId, accountHandle }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || String(res.status));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "İşlem başarısız.");
    } finally {
      setBusyId(null);
    }
  };

  const neutralizeSignal = async (id: string, neutralize: boolean) => {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch("/api/memory/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountHandle, id, action: neutralize ? "neutralize" : "restore" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || String(res.status));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "İşlem başarısız.");
    } finally {
      setBusyId(null);
    }
  };

  const openEvidence = (fact: FactRow) => {
    setDrawerFact(fact);
    setDrawerMode("evidence");
  };

  const openRevise = (fact: FactRow) => {
    setDrawerFact(fact);
    setReviseText(fact.statement);
    setReviseError(null);
    setDrawerMode("revise");
  };

  const confirmRevise = async () => {
    if (!drawerFact) return;
    setRevising(true);
    setReviseError(null);
    try {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revise", factId: drawerFact.id, statement: reviseText.trim(), accountHandle }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || String(res.status));
      setDrawerFact(null);
      await load();
    } catch (err) {
      setReviseError(err instanceof Error ? err.message : "Düzenlenemedi.");
    } finally {
      setRevising(false);
    }
  };

  const signalMetrics: MetricStripItem[] = knowledge
    ? [
        { label: "aktif kural", value: String(knowledge.activeFacts.length) },
        { label: "bekleyen öneri", value: String(knowledge.proposals.length), tone: knowledge.proposals.length > 0 ? "accent" : undefined },
        { label: "performans dersi", value: String(knowledge.performanceLessons.length) },
        {
          label: `sinyal (14g)`,
          value: String(Object.values(knowledge.recentSignals.counts).reduce((a, b) => a + b, 0)),
        },
      ]
    : [];

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        eyebrow="Profil"
        title="CemOS'un bildikleri"
        subtitle="Kaynaklı hafıza: her kural kanıtıyla — onaylanmadan hiçbir öneri taslakları etkilemez."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Select
              aria-label="Hesap"
              options={accountOptions}
              value={accountHandle}
              onChange={(e) => setAccountHandle(e.target.value)}
              data-testid="memory-account-select"
            />
            <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>
              Yenile
            </Button>
          </div>
        }
      />

      {loading ? (
        <Card padded>
          <Skeleton width={280} height={14} style={{ marginBottom: 12 }} />
          <Skeleton lines={5} />
        </Card>
      ) : failed || !knowledge ? (
        <ErrorState title="Hafıza bilgisi alınamadı" description="Sunucuya ulaşılamadı veya işlem başarısız oldu." onRetry={load} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
          {/* Deterministik özet — gerçek DB sayıları (LLM cevabı değil). */}
          <Card variant="quiet" padded>
            <p data-testid="memory-summary" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>
              {knowledge.summary}
            </p>
            <div style={{ marginTop: 10 }}>
              <MetricStrip items={signalMetrics} data-testid="memory-metrics" />
            </div>
          </Card>

          {/* Öğrenme döngüsü etkinliği — Eğitim Merkezi'nden birleşti (ADR-045). Global sistem sinyali. */}
          <div data-testid="memory-learning-activity">
            <LearningStatusCard />
          </div>

          {knowledge.sectionErrors.length > 0 && (
            <div
              role="note"
              style={{ padding: "8px 12px", fontSize: "var(--text-xs)", color: "var(--status-warn-text)", background: "color-mix(in srgb, var(--status-warn) 8%, var(--bg-sunken))", border: "1px solid color-mix(in srgb, var(--status-warn) 24%, transparent)", borderRadius: "var(--radius-md)" }}
            >
              Bazı bölümler alınamadı ({knowledge.sectionErrors.length}) — diğer bölümler etkilenmez.
            </div>
          )}

          {actionError && (
            <div role="alert" style={{ padding: "8px 12px", fontSize: "var(--text-xs)", color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, var(--bg-sunken))", border: "1px solid color-mix(in srgb, var(--danger) 24%, transparent)", borderRadius: "var(--radius-md)" }}>
              {actionError}
            </div>
          )}

          {/* Kural ekle — operatör bootstrap (anında aktif). */}
          <Card variant="feature" padded>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Kural ekle</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
              <Select
                aria-label="Kural tipi"
                options={[
                  { value: "preference", label: "tercih" },
                  { value: "semantic", label: "öğrenilmiş" },
                  { value: "procedural", label: "yazım kuralı" },
                ]}
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              />
              <div style={{ flex: "1 1 260px", minWidth: 200 }}>
                <Input
                  aria-label="Yeni hafıza kuralı"
                  value={newStatement}
                  onChange={(e) => setNewStatement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addFact();
                  }}
                  placeholder='Kuralını yaz (örn. "Emoji kullanma, kısa vurucu cümleler")'
                  maxLength={300}
                  data-testid="memory-add-input"
                />
              </div>
              <Button variant="primary" onClick={addFact} loading={adding} iconLeft={<Plus size={14} strokeWidth={2} />} data-testid="memory-add">
                Kural Ekle
              </Button>
            </div>
            {addError && (
              <span role="alert" style={{ display: "block", marginTop: 8, color: "var(--danger)", fontSize: "var(--text-xs)" }}>{addError}</span>
            )}
            <p style={{ margin: "10px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Elle eklenen kural anında aktifleşir (@{accountHandle} için) ve operatör beyanı olarak kanıtlanır.
            </p>
          </Card>

          {/* Aktif kimlik/yazım kuralları */}
          <section>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Aktif kimlik ve yazım kuralları</div>
            {knowledge.activeFacts.length === 0 ? (
              <EmptyState icon={<Brain size={22} strokeWidth={1.8} />} title="Aktif kural yok" description="İlk kuralını yukarıdan ekleyebilirsin." compact />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {knowledge.activeFacts.map((f) => (
                  <div
                    key={f.id}
                    data-testid={`fact-${f.id}`}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
                  >
                    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                        <Badge variant="muted" size="xs">{TYPE_LABELS[f.type] ?? f.type}</Badge>
                        <Badge variant="muted" size="xs">{f.sourceProvenance}</Badge>
                        <Badge variant="success" size="xs">Taslakları etkiliyor</Badge>
                        {f.legacyUnattributed ? (
                          <span data-testid={`legacy-${f.id}`}>
                            <Badge variant="yellow" size="xs">eski kayıt · kaynak ayrıntısı yok</Badge>
                          </span>
                        ) : (
                          <Badge variant="muted" size="xs">kanıt: {f.evidenceCount} · kaynaklı {f.sourcedEvidenceCount}</Badge>
                        )}
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>{f.statement}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Button size="sm" variant="ghost" onClick={() => openEvidence(f)} iconLeft={<ListTree size={13} strokeWidth={2} />} data-testid={`evidence-open-${f.id}`}>
                        Kanıtlar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openRevise(f)} iconLeft={<Pencil size={13} strokeWidth={2} />} data-testid={`revise-open-${f.id}`}>
                        Düzenle
                      </Button>
                      {f.supersedesId && (
                        <Button size="sm" variant="ghost" onClick={() => act("rollback", f.id)} disabled={busyId === f.id} iconLeft={<Undo2 size={13} strokeWidth={2} />} data-testid={`rollback-${f.id}`}>
                          Geri al
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bekleyen öneriler */}
          <section>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Bekleyen öneriler</div>
            {knowledge.proposals.length === 0 ? (
              <EmptyState
                icon={<Brain size={22} strokeWidth={1.8} />}
                title="Bekleyen öneri yok"
                description="Geri bildirim sinyalleri biriktikçe öneriler burada toplanır. Onaylanana kadar hiçbiri taslakları etkilemez."
                compact
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {knowledge.proposals.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`proposal-${p.id}`}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
                  >
                    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                        <Badge variant="muted" size="xs">{TYPE_LABELS[p.type] ?? p.type}</Badge>
                        {p.legacyUnattributed ? (
                          <span data-testid={`legacy-${p.id}`}>
                            <Badge variant="yellow" size="xs">eski kayıt · kaynak ayrıntısı yok</Badge>
                          </span>
                        ) : (
                          <span data-testid={`evidence-chip-${p.id}`}>
                            <Badge variant={p.reviewReady ? "success" : "muted"} size="xs">
                              kanıt {p.sourcedEvidenceCount}/{knowledge.policy.promotionMinEvidence}
                            </Badge>
                          </span>
                        )}
                        {p.supersedesId && <Badge variant="yellow" size="xs">mevcut kuralla çelişiyor</Badge>}
                        <Badge variant="muted" size="xs">taslakları etkilemiyor</Badge>
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>{p.statement}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!p.legacyUnattributed && (
                        <Button size="sm" variant="ghost" onClick={() => openEvidence(p)} iconLeft={<ListTree size={13} strokeWidth={2} />} data-testid={`evidence-open-${p.id}`}>
                          Kanıtlar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => act("approve", p.id)}
                        loading={busyId === p.id}
                        disabled={!p.reviewReady}
                        title={p.reviewReady ? undefined : `En az ${knowledge.policy.promotionMinEvidence} kaynaklı kanıt gerekir (şu an ${p.sourcedEvidenceCount}).`}
                        iconLeft={<Check size={14} strokeWidth={2} />}
                        data-testid={`approve-${p.id}`}
                      >
                        Onayla
                      </Button>
                      {!p.reviewReady && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => act("adopt", p.id)}
                          disabled={busyId === p.id}
                          title="Kuralı açıkça sahiplen — operatör beyanı olarak kanıtlanır ve aktifleşir."
                          iconLeft={<HandMetal size={13} strokeWidth={2} />}
                          data-testid={`adopt-${p.id}`}
                        >
                          Sahiplen
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => act("reject", p.id)} disabled={busyId === p.id} iconLeft={<X size={14} strokeWidth={2} />} data-testid={`reject-${p.id}`}>
                        Reddet
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Performanstan öğrenilenler — identity'den AYRI truth store */}
          <section data-testid="perf-lessons">
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Performanstan öğrenilenler</div>
            {knowledge.performanceLessons.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Henüz doğrulanmış performans dersi yok — dersler yalnız tekrar + anlamlılık + marka-veto kapılarını geçen
                pattern'lerden gelir; kimlik kurallarına otomatik kopyalanmaz.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {knowledge.performanceLessons.map((l) => (
                  <div
                    key={l.id}
                    data-testid={`lesson-${l.id}`}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}
                  >
                    <Badge variant="accent" size="xs">{l.platform}</Badge>
                    <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {l.patternName}
                      {l.hookType ? ` · ${l.hookType}` : ""}
                    </span>
                    <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      destek {l.validatedSupport} · {dateLabel(l.validatedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Güçlenen aday pattern'ler — doğrulanmamış (validated derslerden AYRI) */}
          <section data-testid="candidate-patterns">
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Güçlenen aday pattern'ler</div>
            {knowledge.candidatePatterns.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Henüz aday pattern yok — madencilik yeni pattern buldukça skoruyla burada belirir. Hiçbiri
                doğrulanana (tekrar + anlamlılık + marka-vetosu) kadar ders sayılmaz.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {knowledge.candidatePatterns.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`candidate-${c.id}`}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}
                  >
                    <Badge variant="muted" size="xs">{c.platform}</Badge>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <TrendingUp size={12} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                      <Badge variant="yellow" size="xs">aday · doğrulanmadı</Badge>
                    </span>
                    <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {c.patternName}
                      {c.hookType ? ` · ${c.hookType}` : ""}
                    </span>
                    <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      skor {c.successScore} · {c.usageCount} kullanım
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p data-testid="training-corpus" style={{ margin: "10px 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
              {knowledge.trainingCorpus.total === 0
                ? "Etiketli eğitim örneği yok — üretimi şekillendiren few-shot havuzu henüz boş."
                : `Eğitim örneği: ${knowledge.trainingCorpus.total} (iyi ${knowledge.trainingCorpus.good} · kötü ${knowledge.trainingCorpus.bad} · düzenlenmiş ${knowledge.trainingCorpus.edited}) — üretimi few-shot olarak şekillendirir.`}
            </p>
          </section>

          {/* Son geri bildirim sinyalleri — neden/düzenleme detayı + etkisizleştir (ADR-045) */}
          <section data-testid="memory-signals">
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>
              Son geri bildirim sinyalleri (14 gün)
              {knowledge.recentSignals.neutralizedCount > 0 && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {knowledge.recentSignals.neutralizedCount} etkisiz</span>
              )}
            </div>
            {knowledge.recentSignals.latest.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Bu pencerede sinyal yok.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {knowledge.recentSignals.latest.map((s) => (
                  <div
                    key={s.id}
                    data-testid={`signal-${s.id}`}
                    style={{ padding: "8px 12px", background: "var(--bg-surface)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)", opacity: s.neutralized ? 0.6 : 1 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--text-xs)" }}>
                      <Badge variant={s.neutralized || s.mechanical ? "muted" : "accent"} size="xs">
                        {SIGNAL_LABELS[s.feedbackType] ?? s.feedbackType}
                      </Badge>
                      <span style={{ color: "var(--text-muted)" }}>
                        {dateLabel(s.createdAt)}
                        {s.mechanical ? " · mekanik (öğrenilmez)" : " · açık sinyal"}
                      </span>
                      {s.hasEdit && (
                        <Badge variant="muted" size="xs">
                          düzenleme{typeof s.editDistance === "number" ? ` · ${s.editDistance}` : ""}
                        </Badge>
                      )}
                      {s.neutralized && <Badge variant="yellow" size="xs">etkisiz</Badge>}
                      <div style={{ marginLeft: "auto" }}>
                        {s.neutralized ? (
                          <Button size="sm" variant="ghost" onClick={() => neutralizeSignal(s.id, false)} disabled={busyId === s.id} iconLeft={<Undo2 size={13} strokeWidth={2} />} data-testid={`signal-restore-${s.id}`}>
                            Geri al
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => neutralizeSignal(s.id, true)} disabled={busyId === s.id} iconLeft={<Ban size={13} strokeWidth={2} />} data-testid={`signal-neutralize-${s.id}`}>
                            Yok say
                          </Button>
                        )}
                      </div>
                    </div>
                    {s.reasonExcerpt && (
                      <div style={{ marginTop: 5, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5, textDecoration: s.neutralized ? "line-through" : "none" }}>
                        “{s.reasonExcerpt}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p style={{ margin: "10px 0 0", fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Bir sinyali <strong>Yok say</strong> dersen gelecekteki hafıza önerilerine girmez; ham kayıt silinmez, geri alınabilir. Halihazırda oluşmuş öneriler yukarıda ayrıca reddedilebilir.
            </p>
          </section>
        </div>
      )}

      {/* Kanıt / düzenleme drawer'ı */}
      <Drawer
        open={!!drawerFact}
        onClose={() => setDrawerFact(null)}
        title={drawerMode === "revise" ? "Kuralı düzenle (yeni sürüm)" : "Kanıt defteri"}
        width={520}
      >
        {drawerFact && drawerMode === "evidence" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="memory-evidence-drawer">
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6, fontWeight: 500 }}>
              {drawerFact.statement}
            </div>
            {drawerFact.evidence.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Bu kayıt defter öncesinden — kaynak ayrıntısı yok (geçmişe kaynak uydurulmaz). Sahiplenirsen bugünkü
                operatör beyanı olarak kanıtlanır.
              </p>
            ) : (
              drawerFact.evidence.map((e) => (
                <div key={e.id} style={{ padding: "10px 12px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <Badge variant="accent" size="xs">{SOURCE_LABELS[e.sourceType] ?? e.sourceType}</Badge>
                    <Badge variant="muted" size="xs">{SIGNAL_LABELS[e.signalType] ?? e.signalType}</Badge>
                    <Badge variant="muted" size="xs">{e.direction}</Badge>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>{dateLabel(e.observedAt)}</span>
                  </div>
                  {e.excerpt && !e.metadataInvalid && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.55 }}>“{e.excerpt}”</div>
                  )}
                  {e.metadataInvalid && (
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--status-warn-text)" }}>kanıt metadata'sı doğrulanamadı — içerik gösterilmiyor</div>
                  )}
                  {!e.sourceAvailable && (
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 4 }}>kaynak kayıt artık mevcut değil</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {drawerFact && drawerMode === "revise" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="memory-revise-drawer">
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Düzenleme yerinde değiştirmez: yeni bir operatör sürümü oluşturur, eski kural supersede zincirinde kalır
              ve geri alınabilir.
            </p>
            <Textarea aria-label="Yeni kural metni" value={reviseText} onChange={(e) => setReviseText(e.target.value)} rows={4} maxLength={300} data-testid="memory-revise-input" />
            {reviseError && (
              <span role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{reviseError}</span>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="primary" onClick={confirmRevise} loading={revising} data-testid="memory-revise-confirm">
                Yeni sürüm olarak kaydet
              </Button>
              <Button variant="ghost" onClick={() => setDrawerFact(null)}>Vazgeç</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
