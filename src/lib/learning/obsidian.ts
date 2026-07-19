/**
 * CemOS Learn → Obsidian export bundle üreticisi (4D). Pack export DTO'sunu
 * Obsidian-uyumlu markdown dosyalarına çevirir — DETERMİNİSTİK (export anı `now()`
 * markdown'a GÖMÜLMEZ; yalnız stable pack değerleri), BASIS-FARKINDA (NotebookLM
 * özeti asla "doğrulanmış video transkripti" gibi etiketlenmez, sahte timestamp yok)
 * ve v2 artifact'ı TAM taşır: MOC ana notu, kaynak notu, atomik notlar, kavram notları
 * (paylaşımlı/çok-pack), Mermaid zihin haritası, uygulama görevleri, içerik fikirleri,
 * flashcard/quiz, QA + provenance özeti.
 *
 * Saf fonksiyon (I/O YOK) → test edilebilir. Yerel vault yazıcısı + GitHub köprüsü +
 * ZIP indirme aynı bundle'ı kullanır. Her dosya managed frontmatter + pack/pipeline/
 * prompt/basis/QA metadata taşır. Mermaid typed graph'tan gelir (ham LLM Mermaid YOK).
 */

import { categoryLabel } from "./types";
import { graphToMermaid } from "./artifact";
import type { PackExport } from "./packExport";
import {
  MANAGED_FLAG,
  computeManifestHash,
  mdSafe,
  packBlockMarkers,
  safeName,
  wikiSafe,
  yamlValue,
} from "./obsidianManifest";

export type ObsidianFileScope = "owned" | "shared";
export type ObsidianFile = {
  path: string; // vault-relative, forward slash
  content: string;
  scope: ObsidianFileScope; // owned → overwrite (aynı pack); shared → çok-pack merge
  packId: string;
};

export type ObsidianBundle = {
  folderName: string;
  packId: string;
  manifestHash: string; // deterministik: aynı pack/artifact → aynı hash
  files: ObsidianFile[];
  meta: {
    pipelineVersion: string;
    promptVersion: string;
    sourceBasis: "transcript" | "summary";
    sourceKind: string;
    qaVerdict: string;
    qaCoverage: number;
    fileCount: number;
  };
};

const VAULT_ROOT = "CemOS Learn";

function mmss(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

/** Frontmatter bloğu kur (değerler yamlValue'dan geçer). */
function frontmatter(lines: string[]): string {
  return ["---", ...lines, "---", ""].join("\n");
}

/** Owned dosya için ortak managed frontmatter satırları. */
function ownedMeta(pack: PackExport, extraTags: string[]): string[] {
  return [
    MANAGED_FLAG,
    `cemos_pack_id: ${pack.id}`,
    `cemos_pipeline: ${yamlValue(pack.pipelineVersion)}`,
    `cemos_prompt: ${yamlValue(pack.promptVersion)}`,
    `cemos_source_basis: ${pack.sourceBasis}`,
    `cemos_source_kind: ${yamlValue(pack.source?.kind ?? "unknown")}`,
    `cemos_qa_verdict: ${yamlValue(pack.qa.verdict)}`,
    `cemos_qa_coverage: ${pack.qa.coverage}`,
    `created: ${pack.createdAtIso}`,
    `tags: [cemos-learn, ${extraTags.join(", ")}]`,
  ];
}

/** Kaynak temeli insan-okur etiketi (dürüstlük: NotebookLM asla video-doğrulanmış görünmez). */
function basisSourceLabel(pack: PackExport): string {
  const kind = pack.source?.kind ?? "";
  if (pack.sourceBasis === "summary" || kind === "notebooklm_summary") {
    return "NotebookLM özeti (operatör girdisi) — doğrulanmış video transkripti DEĞİL";
  }
  if (kind === "manual_transcript") return "Manuel transkript (operatör girdisi)";
  if (kind === "youtube") return "YouTube video transkripti";
  return "Kaynak";
}

/** Grounding çapası → insan-okur etiket. hasTimestamps false → sahte mm:ss ÜRETİLMEZ. */
function groundLabel(
  pack: PackExport,
  chunkStart: Map<number, number>,
  chunkIdxs: number[]
): string {
  if (chunkIdxs.length === 0) return "—";
  const basisWord = pack.sourceBasis === "summary" ? "özet" : "kaynak";
  if (pack.hasTimestamps) {
    const stamps = chunkIdxs
      .map((i) => (chunkStart.has(i) ? mmss(chunkStart.get(i)!) : null))
      .filter((x): x is string => x !== null);
    if (stamps.length > 0) return stamps.join(", ");
  }
  return chunkIdxs.map((i) => `${basisWord} #${i}`).join(", ");
}

/**
 * Pack export DTO → Obsidian bundle. Deterministik + basis-farkında. Çağıran
 * ready kontrolünü YAPMIŞ olmalı (yazıcı null, route 409 döner) — bu fonksiyon
 * saf montaj.
 */
export function buildObsidianBundle(pack: PackExport): ObsidianBundle {
  const title = safeName(pack.source?.title || "Öğrenme Paketi");
  const catFolder = safeName(categoryLabel(pack.category));
  const packSlug = `${title}__${pack.id.slice(-6)}`;
  const base = `${VAULT_ROOT}/${catFolder}/${packSlug}`;
  const chunkStart = new Map(pack.chunks.map((c) => [c.idx, c.startSec]));
  const isSummary = pack.sourceBasis === "summary";
  const basisWord = isSummary ? "özet" : "kaynak";

  const files: ObsidianFile[] = [];
  const owned = (path: string, content: string) =>
    files.push({ path, content, scope: "owned", packId: pack.id });

  // ── Kavram notları (paylaşımlı, çok-pack) — MOC bunlara link verir ──
  const conceptLinks: string[] = [];
  for (const c of pack.concepts) {
    const cname = safeName(c.label);
    conceptLinks.push(`[[${wikiSafe(cname)}]]`);
    const { open, close } = packBlockMarkers(pack.id);
    const block = [
      open,
      `## Kaynak: [[${wikiSafe(title)}]] · ${basisSourceLabel(pack)}`,
      "",
      mdSafe(c.definition) || "_tanım yok_",
      "",
      `**Önem:** ${c.importance} · **Grounding:** ${groundLabel(pack, chunkStart, c.grounding.map((g) => g.chunkIdx))}`,
      close,
    ].join("\n");
    const content =
      frontmatter([MANAGED_FLAG, "cemos_shared: true", `title: "${yamlValue(cname)}"`, "tags: [cemos-learn, kavram]"]) +
      `# ${cname}\n\n` +
      block +
      "\n";
    files.push({ path: `${VAULT_ROOT}/Kavramlar/${cname}.md`, content, scope: "shared", packId: pack.id });
  }

  // ── MOC ana notu ──
  const mermaid = graphToMermaid(pack.graph);
  const notesLinks = pack.atomicNotes.map((n) => `- [[${wikiSafe(safeName(n.title))}]]`).join("\n");
  const mocSections: string[] = [
    frontmatter(ownedMeta(pack, [isSummary ? "ozet" : "transkript", "moc"]).concat([`kanal: "${yamlValue(pack.source?.channelTitle ?? "")}"`])),
    `# ${title}\n`,
    provenanceCallout(pack),
    `## 30 Saniye\n${mdSafe(pack.summaryL1) || "_yok_"}\n`,
    `## Yönetici Özeti\n${mdSafe(pack.summaryL2) || "_yok_"}\n`,
    `## Bölüm Bölüm\n${mdSafe(pack.summaryL3) || "_yok_"}\n`,
  ];
  if (pack.atomicNotes.length > 0) mocSections.push(`## Atomik Notlar\n${notesLinks}\n`);
  if (conceptLinks.length > 0) mocSections.push(`## Kavramlar\n${conceptLinks.map((l) => `- ${l}`).join("\n")}\n`);
  if (pack.graph.edges.length > 0) {
    mocSections.push(`## Zihin Haritası\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`);
  }
  mocSections.push(`## Kaynak\n[[Kaynak]] · [[QA ve Kaynak Güvencesi]]\n`);
  owned(`${base}/${title}.md`, mocSections.join("\n"));

  // ── Kaynak notu ──
  const url = pack.source?.url ?? "";
  const sourceBody = [
    frontmatter(ownedMeta(pack, ["kaynak"])),
    `# Kaynak\n`,
    `- **Tür:** ${basisSourceLabel(pack)}`,
    `- **Kanal / Sahip:** ${mdSafe(pack.source?.channelTitle ?? "—") || "—"}`,
    url ? `- **Bağlantı:** ${isSummary ? "(özet temelli — video doğrulanmadı) " : ""}${url}` : "- **Bağlantı:** —",
    `- **Kaynak temeli:** ${pack.sourceBasis}`,
    pack.hasTimestamps ? "- **Zaman damgası:** var" : "- **Zaman damgası:** yok (bu kaynak zaman-kodsuz — sahte timestamp üretilmez)",
    "",
  ].join("\n");
  owned(`${base}/Kaynak.md`, sourceBody);

  // ── Atomik notlar (her biri owned dosya) ──
  for (const n of pack.atomicNotes) {
    const nname = safeName(n.title);
    const related = n.relatedConceptLabels.map((l) => `[[${wikiSafe(safeName(l))}]]`).join(" · ");
    const body = [
      frontmatter(
        ownedMeta(pack, ["atomik-not"]).concat([
          `grounding: ${n.groundingType}`,
          `note_id: ${n.id}`,
        ])
      ),
      `# ${nname}\n`,
      mdSafe(n.body) || "_boş_",
      "",
      `**Grounding:** ${n.groundingType} · ${groundLabel(pack, chunkStart, n.chunkIdxs)}`,
      related ? `**İlgili kavramlar:** ${related}` : "",
      n.tags.length > 0 ? `**Etiketler:** ${n.tags.map((t) => `#${wikiSafe(t).replace(/\s+/g, "-")}`).join(" ")}` : "",
      "",
    ].join("\n");
    owned(`${base}/Notlar/${nname}.md`, body);
  }

  // ── Uygulama görevleri ──
  if (pack.tasks.length > 0) {
    const tasksMd = pack.tasks
      .map((t, i) => {
        const steps = t.steps.map((s) => `   - ${mdSafe(s)}`).join("\n");
        return [
          `### ${i + 1}. ${mdSafe(t.title)}`,
          t.why ? `> ${mdSafe(t.why)}` : "",
          steps,
          `_Grounding: ${t.groundingType} · ${groundLabel(pack, chunkStart, t.chunkIdxs)}_`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    owned(`${base}/Görevler.md`, frontmatter(ownedMeta(pack, ["gorevler"])) + `# Uygulama Görevleri\n\n${tasksMd}\n`);
  }

  // ── İçerik fikirleri (öneri — yayınlanmış içerik DEĞİL) ──
  if (pack.contentIdeas.length > 0) {
    const ideasMd = pack.contentIdeas
      .map((c, i) =>
        [
          `### ${i + 1}. ${mdSafe(c.title)}`,
          c.angle ? `- **Açı:** ${mdSafe(c.angle)}` : "",
          c.hook ? `- **Kanca:** ${mdSafe(c.hook)}` : "",
          c.format ? `- **Format:** ${mdSafe(c.format)}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");
    owned(
      `${base}/İçerik Fikirleri.md`,
      frontmatter(ownedMeta(pack, ["icerik-fikirleri"])) +
        `# İçerik Fikirleri\n\n> Bunlar **öneridir** — CemOS içinde yayınlanmış/planlanmış içerik değildir.\n\n${ideasMd}\n`
    );
  }

  // ── Flashcard / Quiz ──
  const flashcards = pack.items.filter((it) => it.kind === "flashcard");
  const quizzes = pack.items.filter((it) => it.kind === "quiz_mcq");
  if (flashcards.length > 0 || quizzes.length > 0) {
    const flashMd = flashcards
      .map((f) => `**S:** ${mdSafe(f.front)}\n**C:** ${mdSafe(f.back)}`)
      .join("\n\n");
    const quizMd = quizzes
      .map((q) => {
        const opts = q.options
          .map((o, i) => `${i === q.correctIdx ? "- [x]" : "- [ ]"} ${mdSafe(o)}`)
          .join("\n");
        return `**${mdSafe(q.front)}**\n${opts}${q.back ? `\n> ${mdSafe(q.back)}` : ""}`;
      })
      .join("\n\n");
    const body =
      frontmatter(ownedMeta(pack, ["kartlar"])) +
      `# Kartlar / Quiz\n\n` +
      (flashMd ? `## Flashcard'lar\n${flashMd}\n\n` : "") +
      (quizMd ? `## Quiz\n${quizMd}\n` : "");
    owned(`${base}/Kartlar.md`, body);
  }

  // ── QA + provenance özeti ──
  owned(`${base}/QA ve Kaynak Güvencesi.md`, qaNote(pack, basisWord));

  const manifestHash = computeManifestHash(files.map((f) => ({ path: f.path, content: f.content })));
  return {
    folderName: title,
    packId: pack.id,
    manifestHash,
    files,
    meta: {
      pipelineVersion: pack.pipelineVersion,
      promptVersion: pack.promptVersion,
      sourceBasis: pack.sourceBasis,
      sourceKind: pack.source?.kind ?? "unknown",
      qaVerdict: pack.qa.verdict,
      qaCoverage: pack.qa.coverage,
      fileCount: files.length,
    },
  };
}

/** MOC üstündeki provenance/dürüstlük kutusu. */
function provenanceCallout(pack: PackExport): string {
  if (pack.sourceBasis === "summary") {
    return (
      `> [!warning] NotebookLM özeti\n` +
      `> Bu paket bir **NotebookLM özetine / operatör girdisine** dayanır — orijinal videonun doğrulanmış transkripti DEĞİLDİR. İddialar "özet temelli" işaretlidir; zaman damgası üretilmez.\n`
    );
  }
  return `> [!info] Kaynak temeli: ${basisSourceLabel(pack)} · QA: ${pack.qa.verdict} (kapsam %${Math.round(pack.qa.coverage * 100)})\n`;
}

/** QA + provenance özet notu. */
function qaNote(pack: PackExport, basisWord: string): string {
  return (
    frontmatter(ownedMeta(pack, ["qa"])) +
    `# QA ve Kaynak Güvencesi\n\n` +
    `- **QA kararı:** ${yamlValue(pack.qa.verdict)}\n` +
    `- **Kaynak kapsamı:** %${Math.round(pack.qa.coverage * 100)}\n` +
    `- **İşaretli (flagged) öğe:** ${pack.qa.flaggedCount}\n` +
    `- **Kaynak temeli:** ${pack.sourceBasis} (${basisWord})\n` +
    `- **Pipeline / Prompt:** ${yamlValue(pack.pipelineVersion)} / ${yamlValue(pack.promptVersion)}\n` +
    `- **Zaman damgası:** ${pack.hasTimestamps ? "var" : "yok (sahte timestamp üretilmez)"}\n\n` +
    (pack.sourceBasis === "summary"
      ? `> Bu paketin iddiaları özet temellidir; orijinal videoda doğrulanmış sayılmaz.\n`
      : `> Bu paket yalnız QA'dan (kaynak-grounding kontrolü) geçtiği için "hazır bilgi" olarak dışa aktarılabildi.\n`)
  );
}
