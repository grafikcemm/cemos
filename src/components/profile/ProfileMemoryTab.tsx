"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Check, X, Undo2, RefreshCw, Plus } from "lucide-react";
import { PageHeader, Card, EmptyState, ErrorState, Badge, Button, Select, Input, Skeleton } from "@/components/ui";
import { useAccounts } from "@/components/plan/useAccounts";

/**
 * Profil / CemOS'un bildikleri (05 §G1) — kalıcı hafıza onay kuyruğu (tam sayfa).
 * Bağlayıcı sözleşme: ONAYLANMAMIŞ ÖNERİLER TASLAKLARI ETKİLEMEZ. Elle eklenen
 * kural (yazan=onaylayan) anında aktif; çelişen öneri rozetli; supersede
 * zincirinde rollback. Profil host'u kendi başlığını taşır.
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

const TYPE_LABELS: Record<string, string> = {
  preference: "tercih",
  semantic: "öğrenilmiş",
  procedural: "yazım kuralı",
};

export default function ProfileMemoryTab() {
  const { accounts } = useAccounts();
  const [proposals, setProposals] = useState<FactRow[]>([]);
  const [active, setActive] = useState<FactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newStatement, setNewStatement] = useState("");
  const [newAccount, setNewAccount] = useState("grafikcem");
  const [newType, setNewType] = useState("preference");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/memory/proposals");
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!json.success) throw new Error("payload");
      setProposals(json.proposals ?? []);
      setActive(json.active ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accountOptions = accounts.length > 0
    ? accounts.map((a) => ({ value: a.handle, label: `@${a.handle}` }))
    : [{ value: "grafikcem", label: "@grafikcem" }, { value: "maskulenkod", label: "@maskulenkod" }];

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
        body: JSON.stringify({ action: "add", accountHandle: newAccount, type: newType, statement }),
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
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <PageHeader
        eyebrow="Profil"
        title="CemOS'un bildikleri"
        subtitle="Geri bildirimlerinden damıtılan kurallar — onaylanmadan taslakları etkilemez."
        actions={
          <Button variant="secondary" size="sm" onClick={load} iconLeft={<RefreshCw size={14} strokeWidth={2} />}>
            Yenile
          </Button>
        }
      />

      {/* Bootstrap: kendi kuralını yaz (yazan = onaylayan → anında aktif). */}
      <Card variant="feature" padded style={{ marginBottom: "var(--stack)" }}>
        <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Kural ekle</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <Select aria-label="Kural hesabı" options={accountOptions} value={newAccount} onChange={(e) => setNewAccount(e.target.value)} />
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
          Elle eklenen kural anında aktifleşir. AI önerileri onaylanana kadar üretimi etkilemez.
        </p>
      </Card>

      {loading ? (
        <Card padded><Skeleton lines={4} /></Card>
      ) : failed ? (
        <ErrorState title="Hafıza önerileri alınamadı" description="Sunucuya ulaşılamadı veya işlem başarısız oldu." onRetry={load} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack)" }}>
          {/* Bekleyen öneriler */}
          <section>
            <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Bekleyen öneriler</div>
            {proposals.length === 0 ? (
              <EmptyState
                icon={<Brain size={22} strokeWidth={1.8} />}
                title="Bekleyen öneri yok"
                description="Haftalık damıtma (Pazartesi 18:00 cron) yeni kural önerdiğinde burada görünür. Onaylanana kadar hiçbiri taslakları etkilemez."
                compact
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {proposals.map((p) => (
                  <div
                    key={p.id}
                    data-testid={`proposal-${p.id}`}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
                  >
                    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                        <Badge variant="accent" size="xs">{p.accountHandle ?? "global"}</Badge>
                        <Badge variant="muted" size="xs">{TYPE_LABELS[p.type] ?? p.type}</Badge>
                        <Badge variant="muted" size="xs">kanıt: {p.evidenceCount}</Badge>
                        {p.supersedesId && <Badge variant="yellow" size="xs">mevcut kuralla çelişiyor</Badge>}
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>{p.statement}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" variant="primary" onClick={() => act("approve", p.id)} loading={busyId === p.id} iconLeft={<Check size={14} strokeWidth={2} />}>
                        Onayla
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act("reject", p.id)} disabled={busyId === p.id} iconLeft={<X size={14} strokeWidth={2} />}>
                        Reddet
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Aktif kurallar */}
          {active.length > 0 && (
            <section>
              <div className="eyebrow" style={{ color: "var(--text-muted)", marginBottom: 10 }}>Aktif kurallar</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {active.map((f) => (
                  <div
                    key={f.id}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-sunken)", border: "1px solid var(--border-faint)", borderRadius: "var(--radius-md)" }}
                  >
                    <Badge variant="muted" size="xs">{f.accountHandle ?? "global"}</Badge>
                    <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{f.statement}</span>
                    {f.supersedesId && (
                      <Button size="sm" variant="ghost" onClick={() => act("rollback", f.id)} disabled={busyId === f.id} iconLeft={<Undo2 size={13} strokeWidth={2} />}>
                        Geri al
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
