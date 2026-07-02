"use client";

import { useMemo, useState } from "react";
import { Type, Search, Copy, Tag, FlaskConical, Languages } from "lucide-react";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { PageHeader, Card, EmptyState, Badge, SubNav, useToast } from "@/components/ui";
import keywordLibrary from "@/data/keyword-library.json";

type KeywordRow = {
  category: string;
  local: string | null;
  termTr: string;
  termEn: string;
  termLocal: string | null;
};

type Formula = {
  code: string;
  name: string;
  pattern: string;
  category: string;
  examples: string[];
};

const VIEWS = [
  { id: "keywords", label: "Anahtar Kelimeler" },
  { id: "formulas", label: "Formüller" },
];

const LOCAL_LABELS: Record<string, string> = {
  ru: "RU",
  ja: "JA",
  zh: "ZH",
  ko: "KO",
};

/** JSON'daki kompakt [tr, en, local?] satırlarını düz listeye açar. */
const ALL_KEYWORDS: KeywordRow[] = keywordLibrary.categories.flatMap((cat) =>
  cat.keywords.map((k) => ({
    category: cat.name,
    local: ("local" in cat ? (cat as { local?: string }).local : undefined) ?? null,
    termTr: k[0],
    termEn: k[1],
    termLocal: k[2] ?? null,
  })),
);

const ALL_FORMULAS: Formula[] = keywordLibrary.formulas;

const CATEGORIES = ["all", ...keywordLibrary.categories.map((c) => c.name)];

/**
 * Anahtar Kelime Kütüphanesi — tasarım-prompt kelime arşivi (TR/EN + yerel dil)
 * ve prompt formülleri (F-1..F-50). Veri statik: src/data/keyword-library.json.
 */
export default function KeywordLibraryTab() {
  const [view, setView] = useState("keywords");

  return (
    <div style={{ width: "100%", minWidth: 0, paddingBottom: 60 }}>
      <SubNav items={VIEWS} activeId={view} onSelect={setView} />
      {view === "keywords" ? <KeywordsView /> : <FormulasView />}
    </div>
  );
}

function KeywordsView() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const toast = useToast();

  const filtered = useMemo(() => {
    return ALL_KEYWORDS.filter((k) => {
      if (category !== "all" && k.category !== category) return false;
      if (search) {
        const s = search.toLocaleLowerCase("tr-TR");
        const hay = [k.termTr, k.termEn, k.termLocal, k.category]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [category, search]);

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`${label} kopyalandı.`);
    else toast.error("Kopyalama başarısız.");
  };

  return (
    <div>
      <PageHeader
        eyebrow="KÜTÜPHANE"
        title="Anahtar Kelime Kütüphanesi"
        subtitle="Tasarım-prompt anahtar kelimeleri — Türkçesini bul, İngilizcesini (veya yerel dilini) tek tıkla kopyala."
        meta={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Type size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
              <span className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {filtered.length}
              </span>
              <span>kelime</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Tag size={15} strokeWidth={1.8} style={{ color: "var(--blue)" }} />
              <span className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {CATEGORIES.length - 1}
              </span>
              <span>kategori</span>
            </span>
          </>
        }
      />

      <Card variant="quiet" padded={false} style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                padding: "8px 12px",
                fontSize: "var(--text-sm)",
                outline: "none",
                cursor: "pointer",
                maxWidth: 280,
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Tümü" : c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 }}>
            <label className="eyebrow" style={{ color: "var(--text-muted)" }}>Arama</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search
                size={15}
                strokeWidth={1.8}
                style={{ position: "absolute", left: 12, color: "var(--text-muted)", pointerEvents: "none" }}
              />
              <input
                type="text"
                placeholder="Kelime ara (TR / EN / yerel)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                  padding: "8px 12px 8px 34px",
                  fontSize: "var(--text-sm)",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Type size={24} strokeWidth={1.8} />}
            title="Kelime bulunamadı"
            description="Filtre kriterlerine uyan anahtar kelime yok. Aramayı temizleyip yeniden dene."
          />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {filtered.map((k) => (
            <Card
              key={`${k.category}-${k.termEn}-${k.termTr}`}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span
                  className="font-display"
                  style={{
                    fontSize: "var(--text-md)",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    lineHeight: 1.25,
                  }}
                >
                  {k.termTr}
                </span>
                <Badge variant="muted" size="xs">
                  {k.category}
                </Badge>
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{k.termEn}</div>
              {k.termLocal && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "var(--text-sm)",
                    color: "var(--text-muted)",
                  }}
                >
                  <Languages size={13} strokeWidth={1.8} />
                  {k.termLocal}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 6, flexWrap: "wrap" }}>
                <CopyChip onClick={() => handleCopy(k.termEn, "EN terim")}>EN Kopyala</CopyChip>
                <CopyChip onClick={() => handleCopy(k.termTr, "TR terim")}>TR</CopyChip>
                {k.termLocal && (
                  <CopyChip onClick={() => handleCopy(k.termLocal!, `${LOCAL_LABELS[k.local ?? ""] ?? "Yerel"} terim`)}>
                    {LOCAL_LABELS[k.local ?? ""] ?? "Yerel"}
                  </CopyChip>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FormulasView() {
  const [search, setSearch] = useState("");
  const toast = useToast();

  const groups = useMemo(() => {
    const filtered = ALL_FORMULAS.filter((f) => {
      if (!search) return true;
      const s = search.toLocaleLowerCase("tr-TR");
      return [f.code, f.name, f.pattern, ...f.examples]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(s);
    });
    const map = new Map<string, Formula[]>();
    for (const f of filtered) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return Array.from(map.entries());
  }, [search]);

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Kopyalandı.");
    else toast.error("Kopyalama başarısız.");
  };

  return (
    <div>
      <PageHeader
        eyebrow="KÜTÜPHANE"
        title="Prompt Formülleri"
        subtitle="Kanıtlanmış arama/prompt kalıpları — formülü al, kendi stilin ve sektörünle doldur."
        meta={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <FlaskConical size={15} strokeWidth={1.8} style={{ color: "var(--accent-text)" }} />
            <span className="tnum" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {ALL_FORMULAS.length}
            </span>
            <span>formül</span>
          </span>
        }
      />

      <Card variant="quiet" padded={false} style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", maxWidth: 420 }}>
            <Search
              size={15}
              strokeWidth={1.8}
              style={{ position: "absolute", left: 12, color: "var(--text-muted)", pointerEvents: "none" }}
            />
            <input
              type="text"
              placeholder="Formül veya örnek ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                padding: "8px 12px 8px 34px",
                fontSize: "var(--text-sm)",
                outline: "none",
              }}
            />
          </div>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<FlaskConical size={24} strokeWidth={1.8} />}
            title="Formül bulunamadı"
            description="Aramanı temizleyip tüm formülleri gör."
          />
        </Card>
      ) : (
        groups.map(([groupName, formulas]) => (
          <div key={groupName} style={{ marginBottom: "var(--space-6)" }}>
            <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: "var(--space-3)" }}>
              {groupName}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {formulas.map((f) => (
                <Card key={f.code} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge variant="accent" size="xs">
                      {f.code}
                    </Badge>
                    <span
                      className="font-display"
                      style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text-primary)" }}
                    >
                      {f.name}
                    </span>
                  </div>
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--accent-text)",
                      background: "var(--bg-sunken)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      alignSelf: "flex-start",
                    }}
                  >
                    {f.pattern}
                  </code>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {f.examples.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => handleCopy(ex)}
                        title="Kopyala"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "6px 10px",
                          background: "transparent",
                          border: "1px solid transparent",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-secondary)",
                          fontSize: "var(--text-sm)",
                          fontFamily: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.15s, color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-hover)";
                          e.currentTarget.style.color = "var(--text-primary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--text-secondary)";
                        }}
                      >
                        <span>{ex}</span>
                        <Copy size={13} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.6 }} />
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CopyChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.color = "var(--accent-text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <Copy size={12} strokeWidth={1.8} />
      {children}
    </button>
  );
}
