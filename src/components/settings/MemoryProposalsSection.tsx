"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Check, X, Undo2, RefreshCw, Plus } from "lucide-react";
import { Card, SectionHeader, EmptyState, Badge, Button } from "@/components/ui";
import ErrorState from "@/components/ui/ErrorState";
import { useActiveAccount } from "@/lib/accounts/useActiveAccount";
import { DEFAULT_CHANNELS } from "@/store/xagent";

/**
 * Hafıza onay kuyruğu yüzeyi (Sprint 3 — FINAL-MEMORY-SPEC §6.3, AC-8).
 * Settings içinde yaşar (C9: yeni top-level ekran yok). 4 durum: loading /
 * empty / error / success; aktif kurallarda rollback.
 */

type FactRow = {
  id: string;
  accountHandle: string | null;
  type: string;
  statement: string;
  confidence: number;
  evidenceCount: number;
  sourceProvenance: string;
  supersedesId: string | null;
  createdAt: string;
};

type ApiData = { proposals: FactRow[]; active: FactRow[] };

const TYPE_LABELS: Record<string, string> = {
  preference: "tercih",
  semantic: "öğrenilmiş",
  procedural: "yazım kuralı",
};

export default function MemoryProposalsSection() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newStatement, setNewStatement] = useState("");
  // WP-04 / P0-2 batch A2: bu select YENİ bir kuralın HANGİ hesaba
  // yazılacağını seçer — ekranın GET'i account-unscoped olduğundan two-way
  // BAĞLANMAZ (değişimi global switcher'ı DEĞİL yalnız bu formu etkiler);
  // başlangıç değeri global channel'dan alınır, sonrası serbest form alanı.
  // Seçenekler useActiveAccount().accounts'tan; boşsa sidebar'ın
  // DEFAULT_CHANNELS bootstrap fallback'iyle aynı liste kullanılır.
  const { channel, accounts } = useActiveAccount();
  const accountOptions = accounts.length > 0 ? accounts.map((a) => a.handle) : DEFAULT_CHANNELS;
  const [newAccount, setNewAccount] = useState(channel);
  const [newType, setNewType] = useState("preference");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Denetim 2026-07-23 (kullanıcı-hatası kapanışı): form DIRTY değilken global
  // hesap değişimi hedefi TAKİP eder (bayat @eski-hesap'a yanlış kural yazımı
  // kapanır); dirty'yken operatörün yazdığı bağlam korunur ve hedef aşağıdaki
  // kalıcı "şu hesaba eklenecek" satırıyla HER ZAMAN görünürdür.
  const formDirty = newStatement.trim().length > 0;
  useEffect(() => {
    if (!formDirty) setNewAccount(channel);
    // formDirty bilinçli dep-dışı: yalnız channel değişiminde değerlendirilir —
    // yazarken her tuşta hedef sıfırlanmaz.
  }, [channel]);
  const targetDiffersFromGlobal = newAccount !== channel;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch("/api/memory/proposals");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { success: boolean } & Partial<ApiData>;
      if (!json.success) throw new Error("payload");
      setData({ proposals: json.proposals ?? [], active: json.active ?? [] });
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        body: JSON.stringify({
          action: "add",
          accountHandle: newAccount,
          type: newType,
          statement,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || String(res.status));
      setNewStatement("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Kural eklenemedi.");
    } finally {
      setAdding(false);
    }
  };

  const act = async (action: "approve" | "reject" | "rollback", factId: string) => {
    setBusyId(factId);
    try {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, factId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await load();
    } catch {
      setLoadFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card variant="feature" padded style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader
        eyebrow="HAFIZA"
        title="Hafıza Önerileri"
        description="Geri bildirimlerinden damıtılan kurallar — onaylanmadan taslakları etkilemez."
        action={
          <button
            onClick={load}
            aria-label="Hafıza önerilerini yenile"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "6px 10px",
              color: "var(--text-secondary)", fontSize: "var(--text-xs)",
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <RefreshCw size={13} strokeWidth={2} /> Yenile
          </button>
        }
      />

      {/* Operatör bootstrap ("beni tanısın"): kendi kuralını doğrudan yaz —
          yazan = onaylayan, kural anında aktifleşir. */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: "var(--space-2)",
          alignItems: "center", marginBottom: "var(--space-4)",
          padding: "var(--space-3)", border: "1px dashed var(--border)",
          borderRadius: "var(--radius-md)", background: "var(--bg-base)",
        }}
      >
        <select
          aria-label="Kural hesabı"
          value={newAccount}
          onChange={(e) => setNewAccount(e.target.value)}
          style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "6px 8px",
            color: "var(--text-primary)", fontSize: "var(--text-xs)", fontFamily: "inherit",
          }}
        >
          {accountOptions.map((handle) => (
            <option key={handle} value={handle}>@{handle}</option>
          ))}
        </select>
        {/* Hedef HER ZAMAN görünür; global'den saparsa vurgulu uyarı (mutation
            öncesi son-bakış — yanlış hesaba kural yazımı görünmez olamaz). */}
        <span
          data-testid="proposal-target-notice"
          role={targetDiffersFromGlobal ? "alert" : undefined}
          style={{
            fontSize: "var(--text-xs)",
            color: targetDiffersFromGlobal ? "var(--status-warn-text)" : "var(--text-muted)",
            fontWeight: targetDiffersFromGlobal ? 600 : 400,
          }}
        >
          Kural <strong>@{newAccount}</strong> hesabına eklenecek
          {targetDiffersFromGlobal ? ` (aktif hesap @${channel} DEĞİL)` : ""}.
        </span>
        <select
          aria-label="Kural tipi"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "6px 8px",
            color: "var(--text-primary)", fontSize: "var(--text-xs)", fontFamily: "inherit",
          }}
        >
          <option value="preference">tercih</option>
          <option value="semantic">öğrenilmiş</option>
          <option value="procedural">yazım kuralı</option>
        </select>
        <input
          aria-label="Yeni hafıza kuralı"
          value={newStatement}
          onChange={(e) => setNewStatement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addFact();
          }}
          placeholder='Kuralını yaz (örn. "Emoji kullanma, kısa vurucu cümleler")'
          maxLength={300}
          style={{
            flex: "1 1 240px", minWidth: 0,
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "6px 10px",
            color: "var(--text-primary)", fontSize: "var(--text-xs)", fontFamily: "inherit",
          }}
        />
        <Button size="sm" onClick={addFact} disabled={adding}>
          <Plus size={14} strokeWidth={2} /> {adding ? "Ekleniyor…" : "Kural Ekle"}
        </Button>
        {addError && (
          <span role="alert" style={{ flexBasis: "100%", color: "var(--danger)", fontSize: "var(--text-2xs)" }}>
            {addError}
          </span>
        )}
      </div>

      {loading ? (
        <EmptyState
          icon={<Brain size={22} strokeWidth={1.8} />}
          title="Hafıza önerileri yükleniyor"
          description="Bekleyen kurallar ve aktif hafıza getiriliyor."
          compact
        />
      ) : loadFailed ? (
        <ErrorState
          title="Hafıza önerileri alınamadı"
          description="Sunucuya ulaşılamadı veya işlem başarısız oldu."
          onRetry={load}
        />
      ) : (
        <>
          {(data?.proposals ?? []).length === 0 ? (
            <EmptyState
              icon={<Brain size={22} strokeWidth={1.8} />}
              title="Bekleyen öneri yok"
              description="Haftalık damıtma (Pazartesi 18:00 cron) yeni kural önerdiğinde burada görünür."
              compact
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {(data?.proposals ?? []).map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)",
                    padding: "var(--space-3)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)", background: "var(--bg-surface)",
                  }}
                >
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      <Badge variant="accent" size="xs">{p.accountHandle ?? "global"}</Badge>
                      <Badge variant="muted" size="xs">{TYPE_LABELS[p.type] ?? p.type}</Badge>
                      <Badge variant="muted" size="xs">kanıt: {p.evidenceCount}</Badge>
                      {p.supersedesId && <Badge variant="yellow" size="xs">mevcut kuralla çelişiyor</Badge>}
                    </div>
                    <div style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)" }}>{p.statement}</div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <Button size="sm" onClick={() => act("approve", p.id)} disabled={busyId === p.id}>
                      <Check size={14} strokeWidth={2} /> Onayla
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act("reject", p.id)} disabled={busyId === p.id}>
                      <X size={14} strokeWidth={2} /> Reddet
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(data?.active ?? []).length > 0 && (
            <div style={{ marginTop: "var(--space-5)" }}>
              <div className="eyebrow" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                AKTİF KURALLAR
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {(data?.active ?? []).map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)",
                      padding: "8px var(--space-3)", borderRadius: "var(--radius-md)",
                      background: "var(--bg-base)", border: "1px solid var(--border)",
                      fontSize: "var(--text-xs)", color: "var(--text-secondary)",
                    }}
                  >
                    <Badge variant="muted" size="xs">{f.accountHandle ?? "global"}</Badge>
                    <span style={{ flex: "1 1 220px", minWidth: 0 }}>{f.statement}</span>
                    {f.supersedesId && (
                      <button
                        onClick={() => act("rollback", f.id)}
                        disabled={busyId === f.id}
                        aria-label="Kuralı geri al"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "transparent", border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)", padding: "3px 8px",
                          color: "var(--text-muted)", fontSize: "var(--text-2xs)",
                          fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        <Undo2 size={12} strokeWidth={2} /> Geri al
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
