import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Redesign guard (ADR-020 — DESKTOP DARK EDITORIAL). Üç koruma:
 *  (1) no-literal: eski MOR/VIOLET dark dashboard (#8b5cf6, #a855f7, #ff5538,
 *      neon/glow durum hex'leri) VE Faz 1A açık-tema yüzey literalleri (#f7f6f2…)
 *      component'lerde SIFIR olmalı — renk yalnız token üzerinden gelir.
 *  (2) tema-kilidi: globals.css yüzeyleri KOYU, ana metin AÇIK kalmalı
 *      (relLum yönü) — açık-temaya yanlışlıkla geri dönüş engellenir.
 *  (3) gerçek WCAG 2.1 kontrast: dark token çiftleri ≥4.5:1 (metin) / ≥3:1
 *      (focus ring UI). El-hesabı değil — burada hesaplanır.
 */

const SRC = join(process.cwd(), "src");
const GLOBALS = join(SRC, "app", "globals.css");

// globals.css ve chartColors.ts kaynak-of-truth; onlarda hex literal beklenir.
const ALLOWED = new Set(["src/app/globals.css", "src/lib/theme/chartColors.ts"]);

// Yasaklı literaller — eski MOR dark dashboard + Faz 1A AÇIK-tema yüzeyleri.
const BANNED: Array<[string, RegExp]> = [
  // eski mor/violet dark dashboard accent
  ["mor accent #8b5cf6", /#8b5cf6/i],
  ["mor accent-text #a855f7", /#a855f7/i],
  ["turuncu accent-2 #ff5538", /#ff5538/i],
  // eski mor-dönem yüzeyler
  ["eski dark base #151515", /#151515/i],
  ["eski dark workspace #0f0f10", /#0f0f10/i],
  ["eski dark surface #171719", /#171719/i],
  // eski neon/glow durum hex'leri
  ["neon status-ok #18d989", /#18d989/i],
  ["neon status-info #22c7f2", /#22c7f2/i],
  ["neon status-error #ff4d6d", /#ff4d6d/i],
  ["neon status-warn #e6b566", /#e6b566/i],
  // component'lerde white-opacity kenar/gölge (dark editorial'da token kullan)
  ["white-opacity border rgba(255,255,255", /rgba\(\s*255\s*,\s*255\s*,\s*255/],
  // Faz 1A açık-tema yüzey literalleri — geri sızmamalı (regression)
  ["light base #f7f6f2", /#f7f6f2/i],
  ["light rail #f4f2ed", /#f4f2ed/i],
  ["light sunken #f1efea", /#f1efea/i],
  ["light border #e6e3dc", /#e6e3dc/i],
  ["light border-strong #d8d4cc", /#d8d4cc/i],
  // eski Eden kalıntıları
  ["sage hex #c8e0bf", /#c8e0bf/i],
  ["coral rgba (217,119,87)", /rgba\(\s*217\s*,\s*119\s*,\s*87/],
];

function collectSourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(relative(SRC, full));
    }
  }
  return out;
}

describe("theme token guard (no dark-era literals)", () => {
  const files = collectSourceFiles();

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const [label, re] of BANNED) {
    it(`has zero occurrences of ${label}`, () => {
      const offenders: string[] = [];
      for (const rel of files) {
        const posix = `src/${rel.replace(/\\/g, "/")}`;
        if (ALLOWED.has(posix)) continue;
        const content = readFileSync(join(SRC, rel), "utf8");
        if (re.test(content)) offenders.push(posix);
      }
      expect(offenders, `literal ${label} bulunan dosyalar`).toEqual([]);
    });
  }
});

/* ── WCAG 2.1 gerçek kontrast (ADR-018) ─────────────────────────────────── */

function parseToken(css: string, name: string): string {
  // yalnız :root bloğundaki `--name: #hex;` (color-mix/var referanslarını atla)
  const re = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = css.match(re);
  if (!m) throw new Error(`token --${name} globals.css'te düz hex olarak bulunamadı`);
  return m[1];
}

function relLum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrast(a: string, b: string): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("dark tema kilidi (relLum yönü — açık-temaya dönüş engeli)", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const t = (name: string) => parseToken(css, name);

  it("temel yüzeyler KOYU (relLum düşük)", () => {
    expect(relLum(t("bg-base")), "bg-base koyu olmalı").toBeLessThan(0.15);
    expect(relLum(t("bg-rail")), "bg-rail koyu olmalı").toBeLessThan(0.15);
    expect(relLum(t("bg-surface")), "bg-surface koyu olmalı").toBeLessThan(0.2);
    expect(relLum(t("bg-elevated")), "bg-elevated koyu olmalı").toBeLessThan(0.25);
  });

  it("ana metin AÇIK (relLum yüksek)", () => {
    expect(relLum(t("text-primary")), "text-primary açık olmalı").toBeGreaterThan(0.6);
    expect(relLum(t("text-secondary")), "text-secondary açık olmalı").toBeGreaterThan(0.35);
  });
});

describe("WCAG AA kontrast (gerçek hesap — dark)", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const t = (name: string) => parseToken(css, name);

  // metin/zemin çiftleri (küçük normal metin ≥ 4.5:1). Link = accent-text
  // (dark'ta light terracotta); solid --accent yalnız dolgu (beyaz fg ile test).
  const pairs: Array<[string, string, string]> = [
    ["text-primary / bg-base", "text-primary", "bg-base"],
    ["text-secondary / bg-base", "text-secondary", "bg-base"],
    ["text-muted / bg-base", "text-muted", "bg-base"],
    ["text-primary / bg-surface", "text-primary", "bg-surface"],
    ["text-secondary / bg-surface", "text-secondary", "bg-surface"],
    ["accent-text (link) / bg-base", "accent-text", "bg-base"],
    ["accent-text (link) / bg-surface", "accent-text", "bg-surface"],
    ["status-error / bg-base", "status-error", "bg-base"],
    ["status-ok-text / bg-base", "status-ok-text", "bg-base"],
    ["status-warn-text / bg-base", "status-warn-text", "bg-base"],
  ];

  for (const [label, fg, bg] of pairs) {
    it(`${label} ≥ 4.5:1`, () => {
      const ratio = contrast(t(fg), t(bg));
      expect(ratio, `${label} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("accent-fg (beyaz) accent solid-dolgu üstünde ≥ 4.5:1", () => {
    const ratio = contrast(t("accent-fg"), t("accent"));
    expect(ratio, `accent-fg/accent = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring (accent-text) temel yüzeylerde görünür ≥ 3:1 (UI eşiği)", () => {
    for (const surface of ["bg-base", "bg-surface", "bg-rail", "bg-elevated"]) {
      const ratio = contrast(t("accent-text"), t(surface));
      expect(ratio, `accent-text/${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("text-faint anlam-taşıyan metin için değil (bg-base'de < 4.5:1 — dekoratif)", () => {
    const ratio = contrast(t("text-faint"), t("bg-base"));
    expect(ratio).toBeLessThan(4.5);
  });
});

/* ── Kontrollü açık-ada yüzeyleri (ADR-021: ivory/peach karar kartları) ──────
   Bunlar bilinçli AÇIK adalar (dark-kilit dışı). Üstlerindeki koyu metin gerçek
   WCAG ≥4.5:1 sağlamalı; ve adaların kendisi AÇIK kalmalı (birinin yanlışlıkla
   koyulaştırıp metni görünmez yapmasını engelle). */
describe("inverse/peach açık-ada — gerçek WCAG + açık-ada kilidi", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const t = (name: string) => parseToken(css, name);

  const pairs: Array<[string, string, string]> = [
    ["inverse-text / inverse-surface", "inverse-text", "inverse-surface"],
    ["inverse-muted / inverse-surface", "inverse-muted", "inverse-surface"],
    ["inverse-text / inverse-surface-2", "inverse-text", "inverse-surface-2"],
    ["peach-text / peach-surface", "peach-text", "peach-surface"],
    ["peach-muted / peach-surface", "peach-muted", "peach-surface"],
    ["peach-text / peach-surface-2", "peach-text", "peach-surface-2"],
    // accent solid (küçük detay/ikincil) açık ada üstünde de okunur olmalı
    ["accent / inverse-surface", "accent", "inverse-surface"],
  ];

  for (const [label, fg, bg] of pairs) {
    it(`${label} ≥ 4.5:1`, () => {
      const ratio = contrast(t(fg), t(bg));
      expect(ratio, `${label} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("adalar AÇIK kalmalı (relLum yüksek) — dark-kilit istisnası, bilinçli", () => {
    for (const island of ["inverse-surface", "inverse-surface-2", "peach-surface", "peach-surface-2"]) {
      expect(relLum(t(island)), `${island} açık ada olmalı`).toBeGreaterThan(0.5);
    }
  });

  it("ada metni KOYU (relLum düşük) — açık ada üstünde okunur", () => {
    expect(relLum(t("inverse-text")), "inverse-text koyu").toBeLessThan(0.1);
    expect(relLum(t("peach-text")), "peach-text koyu").toBeLessThan(0.1);
  });
});
