/**
 * Production Pack — onaylı ReelDossier'ı (reel VEYA carousel) indirilebilir bir
 * üretim paketine deterministik olarak ASSEMBLE eder. SAF: LLM YOK, render YOK,
 * ağ YOK, DB YOK, secret YOK — yalnız zaten üretilmiş+onaylanmış dossier alanları
 * text/markdown/SRT dosyalarına dönüştürülür. (ZIP paketleme istemcide yapılır —
 * LearnExportPanel deseni: sunucu `files` döner, tarayıcı jszip ile indirir.)
 *
 * "Onaylı içerik → kullanılabilir çıktı" ürün boşluğunu kapatır: operatör onaylı
 * bir Reels senaryosunu/carousel'ini indirip editöre verebilir veya kendisi çeker.
 */

export type ProductionPackFile = { path: string; content: string };

export type ProductionPackDossier = {
  id: string;
  title: string;
  format: string; // "reel" | "carousel" | "reel+carousel"
  pillar: string;
  objective: string;
  whyNow?: string | null;
  painPoint?: string | null;
  hook?: string | null;
  cover?: string | null;
  cta?: string | null;
  script?: string | null;
  voiceover?: string | null;
  caption: string;
  timelineJson?: string | null;
  scenePlanJson?: string | null;
  screenRecordingPlanJson?: string | null;
  onScreenCopyJson?: string | null;
  hashtagGroupJson?: string | null;
  slidesJson?: string | null;
  assetChecklistJson?: string | null;
  productionEstimate?: string | null;
  risk?: string | null;
  primaryToolJson?: string | null;
  verificationEvidenceJson?: string | null;
  finalReadiness?: string | null;
};

export type ProductionPack = {
  /** İstemcinin ZIP adını türeteceği taban (uzantısız). */
  baseName: string;
  format: "reel" | "carousel";
  files: ProductionPackFile[];
  manifest: { title: string; format: string; fileCount: number; readiness: string };
};

// ── Güvenli JSON yardımcıları ────────────────────────────────────────────────
function parseArray<T = unknown>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Boş satırları kırpmadan, güvenli başlıklı markdown bölümü. */
function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim() || "_(boş)_"}\n`;
}

const TR_FOLD: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ç: "c", Ç: "c", ö: "o", Ö: "o", ü: "u", Ü: "u" };
/** ASCII-güvenli dosya adı tabanı (ZIP girişi + indirme adı için Türkçe fold). */
function slugify(s: string): string {
  const folded = s.replace(/[ıİşŞğĞçÇöÖüÜ]/g, (c) => TR_FOLD[c] ?? c);
  return (
    folded
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "dossier"
  );
}

// ── SRT: timeline beat'lerinden (t alanı) deterministik altyazı ──────────────
/** "0-3sn" / "3-7 sn" / "12sn" gibi bir beat etiketini saniye aralığına çevirir.
 *  Aralık yoksa `prevEnd`'den `defaultDur` süreli tek beat üretir. Ayrıştırılamazsa
 *  null döner (çağıran sıralı fallback uygular). */
export function parseBeatSeconds(
  t: string,
  prevEnd: number,
  defaultDur = 3,
): { start: number; end: number } | null {
  const range = t.match(/(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/);
  if (range) {
    const a = Number(range[1].replace(",", "."));
    const b = Number(range[2].replace(",", "."));
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) return { start: a, end: b };
  }
  const single = t.match(/(\d+(?:[.,]\d+)?)/);
  if (single) {
    const n = Number(single[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return { start: prevEnd, end: prevEnd + n };
  }
  return null;
}

function srtTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, "0")}`;
}

/**
 * Timeline beat'lerini SRT'ye çevirir. Metin önceliği: aynı index'teki ekran
 * yazısı (onScreenCopy) → yoksa beat action'ı. Zamanlama beat'in `t` alanından;
 * ayrıştırılamazsa `defaultDur` süreli sıralı akış (dürüst yaklaşım — sahte
 * hassasiyet yok). Timeline boşsa boş string döner (SRT dosyası yazılmaz).
 */
export function buildSrt(
  timeline: Array<{ t?: unknown; action?: unknown }>,
  onScreenCopy: string[],
  defaultDur = 3,
): string {
  if (timeline.length === 0) return "";
  const cues: string[] = [];
  let prevEnd = 0;
  timeline.forEach((beat, i) => {
    const label = str(beat.t);
    const parsed = parseBeatSeconds(label, prevEnd, defaultDur);
    const start = parsed ? parsed.start : prevEnd;
    const end = parsed ? parsed.end : prevEnd + defaultDur;
    prevEnd = end;
    const text = (onScreenCopy[i] ?? str(beat.action) ?? "").trim() || "…";
    cues.push(`${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`);
  });
  return cues.join("\n");
}

// ── Ortak brief başlığı ──────────────────────────────────────────────────────
function briefHeader(d: ProductionPackDossier): string {
  const tool = parseObject(d.primaryToolJson);
  const toolName = str(tool.name);
  const toolUrl = str(tool.url);
  const lines = [
    `# ${d.title}`,
    "",
    `- **Format:** ${d.format}`,
    `- **Sütun (pillar):** ${d.pillar}`,
    `- **Hedef (objective):** ${d.objective}`,
  ];
  if (d.whyNow) lines.push(`- **Neden şimdi:** ${d.whyNow}`);
  if (d.painPoint) lines.push(`- **Acı nokta:** ${d.painPoint}`);
  if (toolName || toolUrl) lines.push(`- **Araç:** ${toolName}${toolUrl ? ` — ${toolUrl}` : ""}`);
  if (d.productionEstimate) lines.push(`- **Prodüksiyon tahmini:** ${d.productionEstimate}`);
  if (d.risk) lines.push(`- **Risk:** ${d.risk}`);
  if (d.finalReadiness) lines.push(`- **Kanıt hazırlığı:** ${d.finalReadiness}`);
  return lines.join("\n") + "\n";
}

// ── Kaynaklar (doğrulanmış kanıt — yalnız public sinyaller, secret YOK) ──────
function sourcesFile(d: ProductionPackDossier): string {
  const tool = parseObject(d.primaryToolJson);
  const ev = parseObject(d.verificationEvidenceJson);
  const toolName = str(tool.name);
  const toolUrl = str(tool.url);
  if (!toolName && !toolUrl && Object.keys(ev).length === 0) {
    return "# Kaynaklar\n\n_Bu dossier araç/kaynak iddiası içermiyor — konu-odaklı üretim._\n";
  }
  const lines = ["# Kaynaklar (doğrulanmış kanıt)", ""];
  if (toolName || toolUrl) lines.push(`- **Araç:** ${toolName}${toolUrl ? ` — ${toolUrl}` : ""}`);
  const finalUrl = str(ev.finalUrl);
  if (finalUrl) lines.push(`- **Doğrulanan URL:** ${finalUrl}`);
  const opens = ev.opens;
  if (typeof opens === "boolean") lines.push(`- **Site açılıyor:** ${opens ? "evet" : "hayır"}`);
  const signals: Array<[string, unknown]> = [
    ["Ücretsiz katman", ev.freeTier],
    ["Kayıt gerekli", ev.signupRequired],
    ["Kullanım limiti", ev.usageLimits],
    ["Bölge kısıtı", ev.regionRestricted],
    ["Son güncelleme", ev.lastUpdated],
  ];
  for (const [label, val] of signals) {
    if (val === undefined || val === null || val === "") continue;
    const shown = val === "unknown" ? "bilinmiyor" : typeof val === "boolean" ? (val ? "evet" : "hayır") : String(val);
    lines.push(`- **${label}:** ${shown}`);
  }
  lines.push("", "> Yalnız doğrulanmış gerçekler. Kanıtta olmayan fiyat/istatistik iddiası eklemeyin.");
  return lines.join("\n") + "\n";
}

function captionFile(d: ProductionPackDossier): string {
  const hashtags = parseArray<string>(d.hashtagGroupJson).filter((t) => typeof t === "string");
  const tags = hashtags.join(" ");
  return `${d.caption.trim()}${tags ? `\n\n${tags}` : ""}\n`;
}

function checklistFile(d: ProductionPackDossier): string {
  const items = parseArray<{ item?: unknown; done?: unknown }>(d.assetChecklistJson);
  if (items.length === 0) return "";
  const lines = ["# Prodüksiyon kontrol listesi", ""];
  for (const it of items) {
    const label = str(it.item).trim();
    if (!label) continue;
    lines.push(`- [${it.done === true ? "x" : " "}] ${label}`);
  }
  return lines.length > 2 ? lines.join("\n") + "\n" : "";
}

// ── Reel paketi ──────────────────────────────────────────────────────────────
function buildReelFiles(d: ProductionPackDossier): ProductionPackFile[] {
  const files: ProductionPackFile[] = [];
  const timeline = parseArray<{ t?: unknown; action?: unknown }>(d.timelineJson);
  const scenePlan = parseArray<{ scene?: unknown; visual?: unknown; duration?: unknown }>(d.scenePlanJson);
  const screenRec = parseArray<{ step?: unknown; whatToClick?: unknown; capture?: unknown }>(d.screenRecordingPlanJson);
  const onScreen = parseArray<string>(d.onScreenCopyJson).filter((t): t is string => typeof t === "string");

  // 00 — brief
  const briefParts = [briefHeader(d)];
  if (d.hook) briefParts.push(section("Hook (≤8 kelime)", d.hook));
  if (d.cover) briefParts.push(section("Kapak talimatı", d.cover));
  if (d.cta) briefParts.push(section("CTA", d.cta));
  files.push({ path: "00-brief.md", content: briefParts.join("\n") });

  // 01 — senaryo + voiceover
  const scriptParts = ["# Senaryo\n"];
  scriptParts.push(section("Script", str(d.script)));
  if (d.voiceover) scriptParts.push(section("Voiceover (seslendirme)", d.voiceover));
  files.push({ path: "01-senaryo.md", content: scriptParts.join("\n") });

  // 02 — çekim planı (timeline + sahne + ekran kaydı)
  const shotParts = ["# Çekim planı\n"];
  if (timeline.length > 0) {
    const rows = timeline.map((b) => `| ${str(b.t) || "—"} | ${str(b.action)} |`).join("\n");
    shotParts.push(`## Zaman çizelgesi\n\n| Zaman | Aksiyon |\n|---|---|\n${rows}\n`);
  }
  if (scenePlan.length > 0) {
    const rows = scenePlan
      .map((s) => `| ${num(s.scene) ?? "—"} | ${str(s.visual)} | ${str(s.duration) || "—"} |`)
      .join("\n");
    shotParts.push(`## Sahne planı\n\n| Sahne | Görsel | Süre |\n|---|---|---|\n${rows}\n`);
  }
  if (screenRec.length > 0) {
    const rows = screenRec
      .map((s) => `| ${num(s.step) ?? "—"} | ${str(s.whatToClick)} | ${str(s.capture)} |`)
      .join("\n");
    shotParts.push(`## Ekran kaydı adımları\n\n| Adım | Tıklanacak | Yakalanacak |\n|---|---|---|\n${rows}\n`);
  }
  files.push({ path: "02-cekim-plani.md", content: shotParts.join("\n") });

  // 03 — ekran yazıları
  if (onScreen.length > 0) {
    const lines = ["# Ekran yazıları (on-screen text)", ""];
    onScreen.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    files.push({ path: "03-ekran-yazilari.md", content: lines.join("\n") + "\n" });
  }

  // 04 — caption + hashtag
  files.push({ path: "04-caption.txt", content: captionFile(d) });

  // 05 — kaynaklar
  files.push({ path: "05-kaynaklar.md", content: sourcesFile(d) });

  // 06 — kontrol listesi (varsa)
  const checklist = checklistFile(d);
  if (checklist) files.push({ path: "06-kontrol-listesi.md", content: checklist });

  // altyazi.srt (timeline varsa)
  const srt = buildSrt(timeline, onScreen);
  if (srt) files.push({ path: "altyazi.srt", content: srt });

  return files;
}

// ── Carousel paketi ──────────────────────────────────────────────────────────
function buildCarouselFiles(d: ProductionPackDossier): ProductionPackFile[] {
  const files: ProductionPackFile[] = [];
  const slides = parseArray<{ n?: unknown; copy?: unknown; visual?: unknown }>(d.slidesJson);

  const briefParts = [briefHeader(d)];
  if (d.cover) briefParts.push(section("Kapak", d.cover));
  files.push({ path: "00-brief.md", content: briefParts.join("\n") });

  const slideLines = ["# Slaytlar (1080×1350)", ""];
  if (d.cover) slideLines.push(`**Kapak:** ${d.cover}\n`);
  if (slides.length === 0) {
    slideLines.push("_Slayt bulunamadı._");
  } else {
    for (const s of slides) {
      const n = num(s.n);
      slideLines.push(`### Slayt ${n ?? "?"}`, "", str(s.copy).trim() || "_(boş)_", "");
      const visual = str(s.visual).trim();
      if (visual) slideLines.push(`> **Görsel yönü:** ${visual}`, "");
    }
  }
  files.push({ path: "01-slaytlar.md", content: slideLines.join("\n") + "\n" });

  files.push({ path: "02-caption.txt", content: captionFile(d) });
  files.push({ path: "03-kaynaklar.md", content: sourcesFile(d) });
  return files;
}

/**
 * Deterministik Production Pack. `format` "carousel" ise carousel paketi; aksi
 * (reel / reel+carousel) reel paketi. SAF: aynı dossier → aynı dosyalar.
 */
export function buildProductionPack(d: ProductionPackDossier): ProductionPack {
  const isCarousel = d.format === "carousel";
  const files = isCarousel ? buildCarouselFiles(d) : buildReelFiles(d);
  const prefix = isCarousel ? "carousel" : "reel";
  return {
    baseName: `${prefix}-${slugify(d.title)}-${d.id.slice(0, 8)}`,
    format: isCarousel ? "carousel" : "reel",
    files,
    manifest: {
      title: d.title,
      format: d.format,
      fileCount: files.length,
      readiness: d.finalReadiness ?? "unknown",
    },
  };
}
