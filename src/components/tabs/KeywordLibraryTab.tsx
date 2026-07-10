"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Type, Search, Copy, Tag, FlaskConical, Languages, ChevronLeft, ChevronRight } from "lucide-react";
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

/** Kütüphane arketipi: client-side sayfalama boyutu. */
const PAGE_SIZE = 50;

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

/** Kompakt toolbar kontrolü — tek satır, --control-h-sm yüksekliğinde. */
const CONTROL_STYLE: CSSProperties = {
  height: "var(--control-h-sm)",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  padding: "0 12px",
  fontSize: "var(--text-sm)",
  fontFamily: "inherit",
  outline: "none",
};

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
  const [page, setPage] = useState(1);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
        size="compact"
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

      {/* Kompakt toolbar — tek satır: kategori + arama (filtre değişince sayfa 1'e döner) */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <select
          value={category}
          aria-label="Kategori"
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          style={{ ...CONTROL_STYLE, cursor: "pointer", maxWidth: 240 }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "Tümü" : c}
            </option>
          ))}
        </select>
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 200, maxWidth: 420 }}>
          <Search
            size={15}
            strokeWidth={1.8}
            style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }}
          />
          <input
            type="text"
            placeholder="Kelime ara (TR / EN / yerel)..."
            aria-label="Arama"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ ...CONTROL_STYLE, width: "100%", padding: "0 12px 0 32px" }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card variant="quiet">
          <EmptyState
            icon={<Type size={24} strokeWidth={1.8} />}
            title="Kelime bulunamadı"
            description="Filtre kriterlerine uyan anahtar kelime yok. Aramayı temizleyip yeniden dene."
          />
        </Card>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "var(--space-2)",
            }}
          >
            {pageItems.map((k) => (
              <Card
                key={`${k.category}-${k.termEn}-${k.termTr}`}
                style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}
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
                <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 4, flexWrap: "wrap" }}>
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
          {totalPages > 1 && <Pagination page={safePage} total={totalPages} onChange={setPage} />}
        </>
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
        size="compact"
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

      {/* Kompakt toolbar — tek satır arama */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1, minWidth: 200, maxWidth: 420 }}>
          <Search
            size={15}
            strokeWidth={1.8}
            style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }}
          />
          <input
            type="text"
            placeholder="Formül veya örnek ara..."
            aria-label="Arama"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...CONTROL_STYLE, width: "100%", padding: "0 12px 0 32px" }}
          />
        </div>
      </div>

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
          <div key={groupName} style={{ marginBottom: "var(--space-5)" }}>
            <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: "var(--space-2)" }}>
              {groupName}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "var(--space-2)",
              }}
            >
              {formulas.map((f) => (
                <Card key={f.code} style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
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
                      padding: "5px 9px",
                      alignSelf: "flex-start",
                    }}
                  >
                    {f.pattern}
                  </code>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                          padding: "5px 8px",
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

/** Kompakt sayfa kontrolleri — NewsPool'daki pagination dilinin kütüphane hali. */
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const btnStyle = (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: "var(--control-h-sm)",
    padding: "0 14px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--text-xs)",
    fontWeight: 500,
    fontFamily: "inherit",
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: "var(--space-4)" }}>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} style={btnStyle(page <= 1)}>
        <ChevronLeft size={14} strokeWidth={2} /> Önceki
      </button>
      <span className="tnum" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        {String(page).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <button disabled={page >= total} onClick={() => onChange(page + 1)} style={btnStyle(page >= total)}>
        Sonraki <ChevronRight size={14} strokeWidth={2} />
      </button>
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
        padding: "4px 10px",
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
