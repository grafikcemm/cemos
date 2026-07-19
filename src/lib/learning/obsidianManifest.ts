/**
 * CemOS Learn → Obsidian export — saf yardımcılar (4D). Managed-marker sözleşmesi,
 * güvenli isim/etiket kaçışı, deterministik manifest hash ve paylaşımlı kavram
 * notu birleştirme (çok-pack, önceki kaynak kaybolmaz). I/O YOK → test edilebilir;
 * yerel vault yazıcısı + GitHub köprüsü ikisi de bunu paylaşır.
 *
 * Managed sözleşmesi: CemOS'un ürettiği HER dosya frontmatter'da `cemos_managed: true`
 * taşır. Yazıcı, hedefte var olan bir dosyayı ancak managed + aynı pack ise üzerine
 * yazar; unmanaged (kullanıcının kendi notu) veya başka pack ise TYPED CONFLICT üretir
 * (sessiz overwrite YOK). Paylaşımlı kavram notları çok-pack blok işaretçisiyle birleşir.
 */

import { createHash } from "node:crypto";

/** Frontmatter'da managed işareti (yazıcı bununla "bizim dosya mı" karar verir). */
export const MANAGED_FLAG = "cemos_managed: true";

/**
 * Kontrol karakterlerini kod-noktası ile sil (regex kontrol-literali YOK → taşınabilir).
 * keepWhitespace=true: tab/newline/CR korunur (markdown gövdesi); false: hepsi silinir.
 */
function stripControl(s: string, keepWhitespace: boolean): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const isWs = c === 9 || c === 10 || c === 13;
    if (c < 32 && !(keepWhitespace && isWs)) continue;
    if (c === 127) continue;
    out += ch;
  }
  return out;
}

/** Bir dosya CemOS tarafından mı yönetiliyor (frontmatter işareti var mı). */
export function isManagedFile(content: string): boolean {
  return content.includes(MANAGED_FLAG);
}

/** Managed dosyanın pack kimliği (owned dosya çakışma kontrolü). Yoksa null. */
export function packIdOf(content: string): string | null {
  const m = content.match(/^cemos_pack_id:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}

/** Paylaşımlı (çok-pack) kavram notu işareti. */
export function isSharedFile(content: string): boolean {
  return content.includes("cemos_shared: true");
}

/** Bir pack'in paylaşımlı kavram notundaki blok işaretçileri. */
export function packBlockMarkers(packId: string): { open: string; close: string } {
  return { open: `<!-- cemos:pack:${packId} -->`, close: `<!-- /cemos:pack:${packId} -->` };
}

/**
 * YAML frontmatter değer kaçışı. Çift tırnak + newline + kontrol karakterleri
 * temizlenir → frontmatter injection engellenir (kullanıcı başlığı `"\n---\nfoo:`
 * enjekte edemez). Çağıran değeri çift tırnak içine koyar.
 */
export function yamlValue(s: string): string {
  return stripControl(
    (s || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/"/g, "'")
      .replace(/-{3,}/g, "—"), // "---" frontmatter sınırlayıcısını nötrle
    false
  ).trim();
}

/**
 * Wikilink içi güvenli metin. `[]|#^\` Obsidian link sözdizimini kırar/enjekte eder →
 * boşluğa çevir. Sonuç `[[...]]` içine güvenle konur.
 */
export function wikiSafe(s: string): string {
  return stripControl(s || "", false)
    .replace(/[[\]|#^\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dosya/klasör adı güvenli hale getir (FS + Obsidian yasak karakter). Path traversal
 * bileşenleri (`..`, `/`, `\`) ve kontrol karakterleri de temizlenir → tek güvenli
 * segment kalır. Boşsa "Adsiz".
 */
export function safeName(s: string): string {
  const cleaned = stripControl(s || "", false)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\.{2,}/g, " ") // ".." traversal
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return cleaned || "Adsiz";
}

/**
 * Markdown gövdesinde kod-çiti / ham HTML / Mermaid enjeksiyonunu etkisizleştir.
 * LLM'den gelen serbest metin (definition, body, summary) buradan geçer: üç-tik
 * kod çitleri ve `<script`/`<iframe` gibi ham HTML kırılır. Kontrol karakterleri
 * (tab/newline hariç) silinir. Not: Mermaid bloğu ayrıca typed graph'tan üretilir —
 * ham LLM Mermaid ASLA gömülmez.
 */
export function mdSafe(s: string): string {
  return stripControl(s || "", true)
    .replace(/```/g, "ˋˋˋ") // kod-çiti kaçışı (blok kaçışını önle)
    .replace(/<(script|iframe|object|embed|style)\b/gi, "<$1-");
}

/**
 * Deterministik manifest hash: dosya listesinin (path+content) kararlı özeti.
 * Aynı pack/artifact → aynı hash → yazıcı "already_current" tespit eder. Sıralı
 * path → giriş sırasından bağımsız.
 */
export function computeManifestHash(files: { path: string; content: string }[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const h = createHash("sha256");
  for (const f of sorted) {
    h.update(f.path, "utf8");
    h.update(" ", "utf8");
    h.update(f.content, "utf8");
    h.update(" ", "utf8");
  }
  return h.digest("hex").slice(0, 40);
}

/** Tek dosyanın içerik hash'i (unchanged-skip karşılaştırması için). */
export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 40);
}

export type MergeResult =
  | { kind: "changed"; content: string }
  | { kind: "unchanged"; content: string }
  | { kind: "conflict"; reason: string };

/**
 * Paylaşımlı kavram notunu birleştir: incoming = YALNIZ bu pack'in bloğunu içeren
 * taze dosya; existing = vault'ta hâlihazırda olan (başka pack'lerin blokları dahil).
 * - existing yok/boş → incoming yazılır (changed).
 * - existing managed değil → CONFLICT (kullanıcının kendi notu; sessiz ezme YOK).
 * - existing managed → bu pack'in bloğu değiştirilir/eklenir; DİĞER pack blokları korunur.
 *   Blok aynıysa → unchanged (already_current). Bloklar packId'ye göre sıralı → deterministik.
 */
export function mergeSharedConceptFile(
  existing: string | null,
  incoming: string,
  packId: string
): MergeResult {
  if (existing === null || existing.trim() === "") {
    return { kind: "changed", content: incoming };
  }
  if (!isManagedFile(existing)) {
    return { kind: "conflict", reason: "unmanaged" };
  }
  const { open, close } = packBlockMarkers(packId);
  const incBlock = extractBlock(incoming, open, close);
  if (incBlock === null) {
    // incoming beklenen bloğu taşımıyor (mantık hatası) → değişiklik yapma.
    return { kind: "unchanged", content: existing };
  }
  const existingBlocks = extractAllBlocks(existing);
  const prior = existingBlocks.get(packId);
  if (prior === incBlock) {
    return { kind: "unchanged", content: existing };
  }
  existingBlocks.set(packId, incBlock);
  const merged = rebuildSharedFile(incoming, existingBlocks);
  return { kind: "changed", content: merged };
}

/** `open`..`close` arasındaki bloğu (işaretçiler dahil) döndür. Yoksa null. */
function extractBlock(content: string, open: string, close: string): string | null {
  const i = content.indexOf(open);
  if (i < 0) return null;
  const j = content.indexOf(close, i);
  if (j < 0) return null;
  return content.slice(i, j + close.length);
}

/** Tüm `<!-- cemos:pack:ID -->..<!-- /cemos:pack:ID -->` bloklarını packId→blok map'i olarak çıkar. */
function extractAllBlocks(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<!-- cemos:pack:(\S+) -->[\s\S]*?<!-- \/cemos:pack:\1 -->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    map.set(m[1], m[0]);
  }
  return map;
}

/**
 * Paylaşımlı dosyayı yeniden kur: incoming'in header'ını (ilk blok işaretçisine kadar)
 * kullan, sonra tüm blokları packId sıralı ekle (deterministik). Böylece başka pack'lerin
 * blokları korunur ve çıktı giriş sırasından bağımsızdır.
 */
function rebuildSharedFile(incoming: string, blocks: Map<string, string>): string {
  const firstMarker = incoming.indexOf("<!-- cemos:pack:");
  const header = firstMarker >= 0 ? incoming.slice(0, firstMarker) : incoming;
  const orderedIds = [...blocks.keys()].sort();
  const body = orderedIds.map((id) => blocks.get(id)!).join("\n\n");
  return `${header.replace(/\s+$/, "")}\n\n${body}\n`;
}
