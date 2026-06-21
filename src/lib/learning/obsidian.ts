/**
 * CemOS Learn → Obsidian export. Pack DTO'sunu Obsidian-uyumlu markdown dosyalarına
 * çevirir: bir video notu + her kavram için ayrı [[Kavram]] notu. Kavram notları
 * birden çok video tarafından linklenince Obsidian graph view birikim/zihin haritasını
 * kurar. Saf fonksiyon (I/O yok) → test edilebilir; client tarafı ZIP'ler + indirir.
 */

import { categoryLabel } from "./types";

export type ObsidianConcept = {
  label: string;
  definition: string;
  importance: number;
  masteryScore: number;
  grounding: { chunkIdx: number }[];
};
export type ObsidianItem = {
  kind: string;
  front: string;
  back: string;
  options: string[];
  correctIdx: number | null;
  chunkIdx: number | null;
};
export type ObsidianPack = {
  id: string;
  category: string;
  masteryScore: number;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  source: { title: string; channelTitle: string; url: string } | null;
  concepts: ObsidianConcept[];
  items: ObsidianItem[];
  chunks: { idx: number; startSec: number; text: string }[];
};

export type ObsidianFile = { path: string; content: string };
export type ObsidianBundle = { folderName: string; files: ObsidianFile[] };

function safeName(s: string): string {
  // Obsidian/FS-yasak karakterleri temizle.
  const cleaned = (s || "")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "Adsız";
}

function mmss(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

function fm(lines: string[]): string {
  return ["---", ...lines, "---", ""].join("\n");
}

/** " · 1:20, 3:45" eki (liste boşsa boş string). */
function tsuffix(list: string): string {
  return list ? ` · ${list}` : "";
}

export function buildObsidianBundle(pack: ObsidianPack, nowIso: string): ObsidianBundle {
  const title = safeName(pack.source?.title || "Öğrenme Paketi");
  const channel = pack.source?.channelTitle ?? "";
  const url = pack.source?.url ?? "";
  const chunkStart = new Map(pack.chunks.map((c) => [c.idx, c.startSec]));
  const ts = (idx: number | null): string =>
    idx !== null && chunkStart.has(idx) ? ` (${mmss(chunkStart.get(idx)!)})` : "";

  // ── Video notu ──
  const conceptLinks = pack.concepts.map((c) => `- [[${safeName(c.label)}]]`).join("\n");
  const flashcards = pack.items.filter((i) => i.kind === "flashcard");
  const quizzes = pack.items.filter((i) => i.kind === "quiz_mcq");

  const flashMd = flashcards
    .map((f) => `**S:** ${f.front}${ts(f.chunkIdx)}\n**C:** ${f.back}`)
    .join("\n\n");
  const quizMd = quizzes
    .map((q) => {
      const opts = q.options
        .map((o, i) => `${i === q.correctIdx ? "- [x]" : "- [ ]"} ${o}`)
        .join("\n");
      return `**${q.front}**${ts(q.chunkIdx)}\n${opts}${q.back ? `\n> ${q.back}` : ""}`;
    })
    .join("\n\n");

  const catLabel = categoryLabel(pack.category);
  const catFolder = safeName(catLabel);
  const videoNote =
    fm([
      `title: "${title}"`,
      `kanal: "${channel}"`,
      `kaynak: ${url}`,
      `kategori: "${catLabel}"`,
      `mastery: ${pack.masteryScore}`,
      `cemos_pack_id: ${pack.id}`,
      `created: ${nowIso}`,
      `tags: [cemos-learn, video, ${pack.category}]`,
    ]) +
    `# ${title}\n\n` +
    `> [!info] Kaynak\n> Kanal: ${channel} · [YouTube](${url})\n\n` +
    `## 30 Saniye\n${pack.summaryL1}\n\n` +
    `## Yönetici Özeti\n${pack.summaryL2}\n\n` +
    `## Bölüm Bölüm\n${pack.summaryL3}\n\n` +
    `## Kavramlar\n${conceptLinks || "_yok_"}\n\n` +
    (flashMd ? `## Flashcard'lar\n${flashMd}\n\n` : "") +
    (quizMd ? `## Quiz\n${quizMd}\n\n` : "");

  // Video notu kategori klasörüne (kişisel gelişim / yapay zeka ...); kavramlar paylaşımlı.
  const files: ObsidianFile[] = [{ path: `${catFolder}/${title}.md`, content: videoNote }];

  // ── Kavram notları (her biri ayrı → graph birikimi) ──
  for (const c of pack.concepts) {
    const cname = safeName(c.label);
    const tlist = c.grounding
      .map((g) => (chunkStart.has(g.chunkIdx) ? mmss(chunkStart.get(g.chunkIdx)!) : null))
      .filter(Boolean)
      .join(", ");
    const note =
      fm([
        `title: "${cname}"`,
        `önem: ${c.importance}`,
        `mastery: ${c.masteryScore}`,
        `tags: [cemos-learn, kavram]`,
      ]) +
      `# ${cname}\n\n` +
      `${c.definition || "_tanım yok_"}\n\n` +
      `**İlgili video:** [[${title}]]\n` +
      (url ? `**Kaynak:** [YouTube](${url})${tsuffix(tlist)}\n` : "");
    files.push({ path: `Kavramlar/${cname}.md`, content: note });
  }

  return { folderName: title, files };
}
