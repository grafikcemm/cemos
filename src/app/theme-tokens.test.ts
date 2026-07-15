import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Redesign guard (Faz 1A). İki koruma:
 *  (1) no-literal: eski KOYU-dönem literalleri (mor #8b5cf6, turuncu #ff5538,
 *      grafit yüzeyler, koyu-tema durum hex'leri, white-opacity kenarlar) ve
 *      daha eski Eden kalıntıları src/ içinde SIFIR olmalı. Renk yalnız
 *      tokenlar üzerinden gelir; literal geri sızarsa açık tema bozulur.
 *  (2) gerçek WCAG 2.1 kontrast: globals.css token çiftlerinin gerçek kontrast
 *      oranı ≥ 4.5:1 (ADR-018). El-hesabı değil — burada hesaplanır.
 */

const SRC = join(process.cwd(), "src");
const GLOBALS = join(SRC, "app", "globals.css");

// globals.css ve chartColors.ts kaynak-of-truth; onlarda literal beklenir.
const ALLOWED = new Set(["src/app/globals.css", "src/lib/theme/chartColors.ts"]);

// Yasaklı literaller — KOYU-dönem (mor/turuncu/grafit) + Eden kalıntısı.
const BANNED: Array<[string, RegExp]> = [
  // koyu-dönem accent (mor/turuncu)
  ["mor accent #8b5cf6", /#8b5cf6/i],
  ["mor accent-text #a855f7", /#a855f7/i],
  ["turuncu accent-2 #ff5538", /#ff5538/i],
  // koyu-dönem yüzeyler
  ["dark base #151515", /#151515/i],
  ["dark workspace #0f0f10", /#0f0f10/i],
  ["dark surface #171719", /#171719/i],
  // koyu-dönem durum hex'leri
  ["dark status-ok #18d989", /#18d989/i],
  ["dark status-info #22c7f2", /#22c7f2/i],
  ["dark status-error #ff4d6d", /#ff4d6d/i],
  ["dark status-warn #e6b566", /#e6b566/i],
  // white-opacity kenar/gölge (koyu tema imzası)
  ["white-opacity border rgba(255,255,255", /rgba\(\s*255\s*,\s*255\s*,\s*255/],
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

describe("WCAG AA kontrast (gerçek hesap)", () => {
  const css = readFileSync(GLOBALS, "utf8");
  const t = (name: string) => parseToken(css, name);

  // metin/zemin ve chip metni/tint çiftleri (küçük normal metin ≥ 4.5:1)
  const pairs: Array<[string, string, string]> = [
    ["text-primary / bg-base", "text-primary", "bg-base"],
    ["text-secondary / bg-base", "text-secondary", "bg-base"],
    ["text-muted / bg-base", "text-muted", "bg-base"],
    ["accent (link) / bg-base", "accent", "bg-base"],
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

  it("accent-fg (beyaz) accent dolgu üstünde ≥ 4.5:1", () => {
    const ratio = contrast(t("accent-fg"), t("accent"));
    expect(ratio, `accent-fg/accent = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("text-faint anlam-taşıyan metin için değil (bg-base'de < 4.5:1 — dekoratif)", () => {
    // text-faint bilinçli düşük kontrast; bu testi geçmesi onun dekoratif
    // kullanımını belgeler (anlam taşıyan metinde kullanılmamalı).
    const ratio = contrast(t("text-faint"), t("bg-base"));
    expect(ratio).toBeLessThan(4.5);
  });
});
