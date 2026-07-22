import { describe, it, expect } from "vitest";
import {
  buildProductionPack,
  buildSrt,
  parseBeatSeconds,
  type ProductionPackDossier,
} from "./productionPack";

function reelDossier(over: Partial<ProductionPackDossier> = {}): ProductionPackDossier {
  return {
    id: "ckabc123defg4567",
    title: "AI mockup akışı",
    format: "reel",
    pillar: "arac_demo",
    objective: "saves",
    whyNow: "Yeni sürüm çıktı",
    painPoint: "Mockup çok zaman alıyor",
    hook: "3 tıkla mockup",
    cover: "Yakın çekim ekran",
    cta: "Kaydet ve dene",
    script: "Sahne 1: hook. Sahne 2: demo.",
    voiceover: "Bu araçla mockup saniyeler sürer.",
    caption: "AI ile mockup akışı 👇",
    timelineJson: JSON.stringify([
      { t: "0-3sn", action: "Hook göster" },
      { t: "3-7sn", action: "Demo başlat" },
    ]),
    scenePlanJson: JSON.stringify([{ scene: 1, visual: "Ekran", duration: "3sn" }]),
    screenRecordingPlanJson: JSON.stringify([{ step: 1, whatToClick: "Yeni proje", capture: "Sonuç" }]),
    onScreenCopyJson: JSON.stringify(["3 tıkla mockup", "Saniyeler sürer"]),
    hashtagGroupJson: JSON.stringify(["#tasarim", "#ai"]),
    slidesJson: "[]",
    assetChecklistJson: JSON.stringify([{ item: "Ekran kaydı", done: false }]),
    productionEstimate: "20 dk",
    risk: "Düşük",
    primaryToolJson: JSON.stringify({ name: "MockTool", url: "https://mocktool.example" }),
    verificationEvidenceJson: JSON.stringify({ finalUrl: "https://mocktool.example/app", opens: true, freeTier: true, signupRequired: false }),
    finalReadiness: "ready",
    ...over,
  };
}

function carouselDossier(over: Partial<ProductionPackDossier> = {}): ProductionPackDossier {
  return {
    id: "ckxyz987carousel",
    title: "En iyi 5 AI aracı",
    format: "carousel",
    pillar: "best_ai_tools",
    objective: "reach",
    caption: "Kaydet 👇",
    cover: "5 araç, tek carousel",
    slidesJson: JSON.stringify([
      { n: 1, copy: "Araç 1", visual: "Logo" },
      { n: 2, copy: "Araç 2", visual: "Ekran" },
    ]),
    hashtagGroupJson: JSON.stringify(["#ai", "#tasarim"]),
    primaryToolJson: "{}",
    verificationEvidenceJson: "{}",
    finalReadiness: "ready",
    ...over,
  };
}

const paths = (p: ReturnType<typeof buildProductionPack>) => p.files.map((f) => f.path);
const fileOf = (p: ReturnType<typeof buildProductionPack>, path: string) => p.files.find((f) => f.path === path)?.content ?? "";

describe("buildProductionPack — reel", () => {
  it("tam reel paketi: brief/senaryo/çekim/ekran-yazıları/caption/kaynaklar/checklist/SRT", () => {
    const p = buildProductionPack(reelDossier());
    expect(p.format).toBe("reel");
    expect(paths(p)).toEqual([
      "00-brief.md",
      "01-senaryo.md",
      "02-cekim-plani.md",
      "03-ekran-yazilari.md",
      "04-caption.txt",
      "05-kaynaklar.md",
      "06-kontrol-listesi.md",
      "altyazi.srt",
    ]);
    expect(fileOf(p, "00-brief.md")).toContain("AI mockup akışı");
    expect(fileOf(p, "00-brief.md")).toContain("3 tıkla mockup"); // hook
    expect(fileOf(p, "01-senaryo.md")).toContain("Sahne 1: hook");
    expect(fileOf(p, "01-senaryo.md")).toContain("Voiceover");
    expect(fileOf(p, "02-cekim-plani.md")).toContain("Demo başlat"); // timeline action
    expect(fileOf(p, "02-cekim-plani.md")).toContain("Yeni proje"); // screen rec
    expect(fileOf(p, "04-caption.txt")).toContain("#tasarim #ai"); // hashtags appended
    expect(fileOf(p, "05-kaynaklar.md")).toContain("https://mocktool.example");
    expect(fileOf(p, "06-kontrol-listesi.md")).toContain("- [ ] Ekran kaydı");
    expect(p.baseName).toMatch(/^reel-ai-mockup-akisi-ckabc123$/);
  });

  it("SRT: timeline zamanlarından deterministik cue'lar (metin = ekran yazısı)", () => {
    const p = buildProductionPack(reelDossier());
    const srt = fileOf(p, "altyazi.srt");
    expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
    expect(srt).toContain("00:00:03,000 --> 00:00:07,000");
    expect(srt).toContain("3 tıkla mockup"); // onScreenCopy[0] tercih edildi
    expect(srt).toContain("Saniyeler sürer"); // onScreenCopy[1]
  });

  it("timeline boşsa SRT dosyası yazılmaz; eksik alanlar crash etmez", () => {
    const p = buildProductionPack(reelDossier({ timelineJson: "[]", onScreenCopyJson: "[]", assetChecklistJson: "[]" }));
    expect(paths(p)).not.toContain("altyazi.srt");
    expect(paths(p)).not.toContain("03-ekran-yazilari.md");
    expect(paths(p)).not.toContain("06-kontrol-listesi.md");
    expect(paths(p)).toContain("00-brief.md");
  });

  it("deterministik: aynı dossier → aynı çıktı", () => {
    const d = reelDossier();
    expect(buildProductionPack(d)).toEqual(buildProductionPack(d));
  });

  it("bozuk JSON alanları güvenli boş sayılır (crash yok)", () => {
    const p = buildProductionPack(reelDossier({ timelineJson: "{bozuk", slidesJson: "not-json", hashtagGroupJson: "nope" }));
    expect(paths(p)).toContain("00-brief.md");
    expect(fileOf(p, "04-caption.txt")).not.toContain("#"); // bozuk hashtag → yok
  });
});

describe("buildProductionPack — carousel", () => {
  it("carousel paketi: brief/slaytlar/caption/kaynaklar; slayt görsel yönü taşınır", () => {
    const p = buildProductionPack(carouselDossier());
    expect(p.format).toBe("carousel");
    expect(paths(p)).toEqual(["00-brief.md", "01-slaytlar.md", "02-caption.txt", "03-kaynaklar.md"]);
    expect(fileOf(p, "01-slaytlar.md")).toContain("Slayt 1");
    expect(fileOf(p, "01-slaytlar.md")).toContain("Araç 1");
    expect(fileOf(p, "01-slaytlar.md")).toContain("Görsel yönü");
    expect(fileOf(p, "03-kaynaklar.md")).toContain("araç/kaynak iddiası içermiyor"); // no tool
    expect(p.baseName).toMatch(/^carousel-/);
  });
});

describe("parseBeatSeconds / buildSrt", () => {
  it("aralık ('0-3sn') ve tekil ('4sn') ve ayrıştırılamaz beat'i işler", () => {
    expect(parseBeatSeconds("0-3sn", 0)).toEqual({ start: 0, end: 3 });
    expect(parseBeatSeconds("3 - 7 sn", 0)).toEqual({ start: 3, end: 7 });
    expect(parseBeatSeconds("4sn", 10)).toEqual({ start: 10, end: 14 }); // prevEnd'den süre
    expect(parseBeatSeconds("giriş", 5, 3)).toBeNull(); // sayı yok → sıralı fallback çağırana
  });

  it("ayrıştırılamaz beat'lerde sıralı 3sn fallback (sahte hassasiyet yok)", () => {
    const srt = buildSrt([{ t: "giriş", action: "a" }, { t: "orta", action: "b" }], [], 3);
    expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
    expect(srt).toContain("00:00:03,000 --> 00:00:06,000");
  });

  it("milisaniye yuvarlamasını sonraki saniyeye taşır; geçersiz ,1000 üretmez", () => {
    const srt = buildSrt([{ t: "0-2.9999sn", action: "test" }], []);
    expect(srt).toContain("00:00:00,000 --> 00:00:03,000");
    expect(srt).not.toContain(",1000");
  });

  it("timeline boş → boş string", () => {
    expect(buildSrt([], [])).toBe("");
  });
});
