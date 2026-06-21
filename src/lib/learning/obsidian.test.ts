import { describe, it, expect } from "vitest";
import { buildObsidianBundle, type ObsidianPack } from "./obsidian";

const pack: ObsidianPack = {
  id: "pack1",
  category: "yapay_zeka",
  masteryScore: 42,
  summaryL1: "Tek cümle özet.",
  summaryL2: "Yönetici özeti.",
  summaryL3: "Bölüm bölüm.",
  source: { title: "Test: Video / Adı?", channelTitle: "Kanal", url: "https://youtu.be/x" },
  concepts: [
    { label: "Aktif Hatırlama", definition: "Tanım.", importance: 90, masteryScore: 50, grounding: [{ chunkIdx: 0 }] },
    { label: "Aralıklı Tekrar", definition: "Tanım 2.", importance: 70, masteryScore: 30, grounding: [{ chunkIdx: 1 }] },
  ],
  items: [
    { kind: "flashcard", front: "Soru?", back: "Cevap.", options: [], correctIdx: null, chunkIdx: 0 },
    { kind: "quiz_mcq", front: "Hangisi?", back: "Gerekçe.", options: ["A", "B"], correctIdx: 1, chunkIdx: 1 },
  ],
  chunks: [
    { idx: 0, startSec: 0, text: "..." },
    { idx: 1, startSec: 75, text: "..." },
  ],
};

describe("buildObsidianBundle", () => {
  const bundle = buildObsidianBundle(pack, "2026-06-21T00:00:00.000Z");

  it("sanitizes the title + puts video note under the category folder", () => {
    expect(bundle.folderName).toBe("Test Video Adı"); // / : ? temizlendi
    expect(bundle.files[0].path).toBe("Yapay Zeka/Test Video Adı.md"); // kategori klasörü
    expect(bundle.files[0].content).toContain('kategori: "Yapay Zeka"');
    expect(bundle.files[0].content).toContain("tags: [cemos-learn, video, yapay_zeka]");
  });

  it("emits one video note + one note per concept", () => {
    expect(bundle.files.length).toBe(1 + pack.concepts.length);
    expect(bundle.files.some((f) => f.path === "Kavramlar/Aktif Hatırlama.md")).toBe(true);
    expect(bundle.files.some((f) => f.path === "Kavramlar/Aralıklı Tekrar.md")).toBe(true);
  });

  it("links concepts from the video note as wikilinks (graph)", () => {
    const main = bundle.files[0].content;
    expect(main).toContain("[[Aktif Hatırlama]]");
    expect(main).toContain("[[Aralıklı Tekrar]]");
  });

  it("concept note backlinks to the video note", () => {
    const note = bundle.files.find((f) => f.path === "Kavramlar/Aktif Hatırlama.md")!.content;
    expect(note).toContain("[[Test Video Adı]]");
    expect(note).toContain("tags: [cemos-learn, kavram]");
  });

  it("renders timestamp + quiz answer marks", () => {
    const main = bundle.files[0].content;
    expect(main).toContain("(1:15)"); // chunk idx 1 → 75s
    expect(main).toContain("- [x] B"); // correctIdx 1
  });
});
