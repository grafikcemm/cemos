import { describe, it, expect } from "vitest";
import { deterministicThreadSplit } from "./threadBackfill";

const LIMIT = 280;

describe("deterministicThreadSplit — Phase 2D backfill (LLM'siz, deterministik)", () => {
  it("boş-satır blokları split edilir (blank_blocks)", () => {
    const text = "Hook cümlesi burada.\n\n→ Madde bir\n→ Madde iki\n\nKapanış payoff cümlesi.";
    const res = deterministicThreadSplit(text, LIMIT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.strategy).toBe("blank_blocks");
      expect(res.segments.map((s) => s.text)).toEqual([
        "Hook cümlesi burada.",
        "→ Madde bir\n→ Madde iki",
        "Kapanış payoff cümlesi.",
      ]);
    }
  });

  it("açık numaralı yapı split edilir (numbered_markers) — metin yeniden yazılmaz", () => {
    // Numaralı satırlar TEK blok içinde (boş satır yok) → blank_blocks devreye giremez.
    const text = "Maskülenliğin 3 gerçeği:\n1. Güç sınır koymaktır.\n2. Disiplin sistemdir.\n3. Yön onaydan önce gelir.";
    const res = deterministicThreadSplit(text, LIMIT);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.strategy).toBe("numbered_markers");
      // İşaretler OLDUĞU GİBİ korunur; prefix hook kendi segmenti olur.
      expect(res.segments[0].text).toBe("Maskülenliğin 3 gerçeği:");
      expect(res.segments[1].text.startsWith("1. ")).toBe(true);
      expect(res.segments.length).toBe(4);
    }
  });

  it("kesintisiz 1..n dizisi ŞART — '2024/12' benzeri tesadüf split ÜRETMEZ", () => {
    const text = "Tek paragraf metin 2. bir şey 5. başka şey aynı satırda değil.\nikinci satır 3. madde değil.";
    const res = deterministicThreadSplit(text, LIMIT);
    expect(res.ok).toBe(false);
  });

  it("belirsiz tek blok metin OLDUĞU GİBİ bırakılır (single_block)", () => {
    const res = deterministicThreadSplit("Tek uzun paragraf, boş satır yok, numara yok.", LIMIT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("single_block");
  });

  it("tek uzun metin TEK segment olarak backfill edilmez", () => {
    const res = deterministicThreadSplit("x".repeat(500), LIMIT);
    expect(res.ok).toBe(false);
  });

  it("blok segment sınırını aşıyorsa split edilmez (segment_over_limit)", () => {
    const text = `Kısa hook.\n\n${"y".repeat(300)}`;
    const res = deterministicThreadSplit(text, LIMIT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("segment_over_limit");
  });

  it("boş metin → ambiguous, split yok", () => {
    expect(deterministicThreadSplit("", LIMIT).ok).toBe(false);
    expect(deterministicThreadSplit("   ", LIMIT).ok).toBe(false);
  });

  it("deterministik: aynı girdi her koşuda aynı çıktı (idempotent kaynak)", () => {
    const text = "Hook.\n\nOrta blok.\n\nSon blok.";
    const a = deterministicThreadSplit(text, LIMIT);
    const b = deterministicThreadSplit(text, LIMIT);
    expect(a).toEqual(b);
  });
});
