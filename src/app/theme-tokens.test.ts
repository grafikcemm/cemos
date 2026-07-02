import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Redesign guard (F4): eski Eden literalleri (sage rgba üçlüsü, coral rgba,
 * off-token durum hex'leri, topstrip near-black) src/ içinde SIFIR olmalı.
 * Yeni renk yalnız tokenlar (globals.css :root + @theme) üzerinden gelir;
 * literal geri sızarsa tema değişimi bu dosyayı otomatik yakalamaz → test tutar.
 */

const SRC = join(process.cwd(), "src");

// globals.css ve chartColors.ts kaynak-of-truth; onlarda literal beklenir.
const ALLOWED = new Set(["src/app/globals.css", "src/lib/theme/chartColors.ts"]);

// Yasaklı literaller (Eden kalıntısı) — regex kaynağı.
const BANNED: Array<[string, RegExp]> = [
  ["sage rgba (200,224,191)", /rgba\(\s*200\s*,\s*224\s*,\s*191/],
  ["coral rgba (217,119,87)", /rgba\(\s*217\s*,\s*119\s*,\s*87/],
  ["topstrip near-black rgba(11,12,16)", /rgba\(\s*11\s*,\s*12\s*,\s*16/],
  ["off-token amber #f59e0b", /#f59e0b/i],
  ["off-token red #f87171", /#f87171/i],
  ["off-token green #4ade80", /#4ade80/i],
  ["off-token blue #60a5fa", /#60a5fa/i],
  ["sage hex #c8e0bf", /#c8e0bf/i],
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

describe("theme token guard (no Eden literals)", () => {
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
