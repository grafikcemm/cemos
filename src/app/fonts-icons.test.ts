import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Faz 1C.1 sadakat kilidi:
 *  (1) Tipografi: app-sans değişkeni Plus Jakarta Sans'a bağlı; eski Inter/
 *      Newsreader app-yüzeyinde SIFIR (regresyon).
 *  (2) Tek ikon ailesi: yalnız lucide-react; phosphor/heroicons/react-icons
 *      karışımı YOK. Shell ikonları AppIcon primitive'inden geçer.
 */

const SRC = join(process.cwd(), "src");
const GLOBALS = join(SRC, "app", "globals.css");
const LAYOUT = join(SRC, "app", "layout.tsx");

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

describe("tipografi (ADR-021 — geometrik sans)", () => {
  const globals = readFileSync(GLOBALS, "utf8");
  const layout = readFileSync(LAYOUT, "utf8");

  it("layout Plus Jakarta Sans yükler + --font-app-sans değişkeni", () => {
    expect(layout).toMatch(/Plus_Jakarta_Sans/);
    expect(layout).toMatch(/--font-app-sans/);
  });

  it("layout latin-ext subset içerir (Türkçe glyph)", () => {
    expect(layout).toMatch(/latin-ext/);
  });

  it("globals --font-sans/--font-display, --font-app-sans'a bağlı", () => {
    expect(globals).toMatch(/--font-sans:\s*var\(--font-app-sans\)/);
    expect(globals).toMatch(/--font-display:\s*var\(--font-app-sans\)/);
    expect(globals).toMatch(/Plus Jakarta Sans/);
  });

  it("eski --font-inter değişkeni + Inter() font çağrısı app'te SIFIR (regresyon)", () => {
    expect(globals).not.toMatch(/--font-inter/);
    // Aktif font çağrısı Inter({...}) YOK (yorumdaki tarihsel "Inter" referansı serbest).
    expect(layout).not.toMatch(/\bInter\(/);
  });

  it("Newsreader app-yüzeyinde SIFIR", () => {
    for (const rel of collectSourceFiles()) {
      const content = readFileSync(join(SRC, rel), "utf8");
      expect(content, `Newsreader bulundu: src/${rel}`).not.toMatch(/Newsreader/);
    }
  });
});

describe("ikon ailesi (tek aile = lucide)", () => {
  const files = collectSourceFiles();

  it("phosphor / heroicons / react-icons importu YOK (aile karışımı yasak)", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const content = readFileSync(join(SRC, rel), "utf8");
      if (/@phosphor-icons|@heroicons|from ["']react-icons/.test(content)) {
        offenders.push(`src/${rel.replace(/\\/g, "/")}`);
      }
    }
    expect(offenders, "yabancı ikon ailesi importu").toEqual([]);
  });

  it("AppIcon primitive mevcut", () => {
    const appIcon = readFileSync(join(SRC, "components", "ui", "AppIcon.tsx"), "utf8");
    expect(appIcon).toMatch(/export default function AppIcon/);
    expect(appIcon).toMatch(/LucideIcon/);
  });

  it("shell (Sidebar/ProfileMenu) AppIcon kullanır", () => {
    for (const f of ["components/shell/Sidebar.tsx", "components/shell/ProfileMenu.tsx"]) {
      const content = readFileSync(join(SRC, f), "utf8");
      expect(content, `${f} AppIcon import`).toMatch(/AppIcon/);
    }
  });
});
