import { describe, it, expect } from "vitest";
import {
  safeName,
  yamlValue,
  wikiSafe,
  mdSafe,
  computeManifestHash,
  contentHash,
  isManagedFile,
  packIdOf,
  packBlockMarkers,
  mergeSharedConceptFile,
  MANAGED_FLAG,
} from "./obsidianManifest";

describe("obsidianManifest — güvenli isim/kaçış", () => {
  it("safeName path traversal bileşenlerini temizler", () => {
    expect(safeName("../../etc/passwd")).not.toContain("..");
    expect(safeName("../../etc/passwd")).not.toContain("/");
    expect(safeName("a/b\\c")).toBe("a b c");
  });

  it("safeName Obsidian/FS yasak karakterleri siler, boşta 'Adsiz'", () => {
    expect(safeName('a:*?"<>|#^[]b')).toBe("a b");
    expect(safeName("   ")).toBe("Adsiz");
    expect(safeName("")).toBe("Adsiz");
  });

  it("yamlValue frontmatter injection'ı kırar (tırnak + newline)", () => {
    const evil = 'Title"\n---\ninjected: true';
    const out = yamlValue(evil);
    expect(out).not.toContain('"');
    expect(out).not.toContain("\n");
    expect(out).not.toContain("---");
  });

  it("wikiSafe link sözdizimini nötrler", () => {
    expect(wikiSafe("a[[b]]|c#d^e")).toBe("a b c d e");
  });

  it("mdSafe kod-çiti ve ham HTML script'i kırar", () => {
    expect(mdSafe("```js\nalert(1)\n```")).not.toContain("```");
    expect(mdSafe("<script>x</script>")).toContain("<script-");
    // Türkçe karakter korunur
    expect(mdSafe("Çğıöşü İ")).toContain("Çğıöşü");
  });
});

describe("obsidianManifest — deterministik hash", () => {
  it("aynı dosyalar (sıra farklı) → aynı manifest hash", () => {
    const a = [
      { path: "b.md", content: "B" },
      { path: "a.md", content: "A" },
    ];
    const b = [
      { path: "a.md", content: "A" },
      { path: "b.md", content: "B" },
    ];
    expect(computeManifestHash(a)).toBe(computeManifestHash(b));
  });

  it("içerik değişince hash değişir", () => {
    const a = [{ path: "a.md", content: "A" }];
    const b = [{ path: "a.md", content: "A2" }];
    expect(computeManifestHash(a)).not.toBe(computeManifestHash(b));
  });

  it("contentHash kararlı + fark ayırır", () => {
    expect(contentHash("x")).toBe(contentHash("x"));
    expect(contentHash("x")).not.toBe(contentHash("y"));
  });
});

describe("obsidianManifest — managed marker", () => {
  it("isManagedFile + packIdOf frontmatter'dan okur", () => {
    const f = `---\n${MANAGED_FLAG}\ncemos_pack_id: pack_123\n---\n# x`;
    expect(isManagedFile(f)).toBe(true);
    expect(packIdOf(f)).toBe("pack_123");
    expect(isManagedFile("# plain")).toBe(false);
    expect(packIdOf("# plain")).toBeNull();
  });
});

describe("obsidianManifest — paylaşımlı kavram birleştirme", () => {
  const mk = (packId: string, body: string) => {
    const { open, close } = packBlockMarkers(packId);
    return `---\n${MANAGED_FLAG}\ncemos_shared: true\ntitle: "Kavram"\n---\n# Kavram\n\n${open}\n${body}\n${close}\n`;
  };

  it("existing yok → incoming yazılır (changed)", () => {
    const inc = mk("p1", "def1");
    const r = mergeSharedConceptFile(null, inc, "p1");
    expect(r.kind).toBe("changed");
  });

  it("existing unmanaged → conflict (kullanıcı notu ezilmez)", () => {
    const inc = mk("p1", "def1");
    const r = mergeSharedConceptFile("# Benim elle yazdığım not", inc, "p1");
    expect(r.kind).toBe("conflict");
  });

  it("aynı blok tekrar → unchanged (already_current)", () => {
    const inc = mk("p1", "def1");
    const r = mergeSharedConceptFile(inc, inc, "p1");
    expect(r.kind).toBe("unchanged");
  });

  it("başka pack'in bloğu korunur, yeni pack eklenir (kaynak kaybı yok)", () => {
    const existing = mk("p1", "def1");
    const incoming = mk("p2", "def2");
    const r = mergeSharedConceptFile(existing, incoming, "p2");
    expect(r.kind).toBe("changed");
    if (r.kind === "changed") {
      expect(r.content).toContain("cemos:pack:p1");
      expect(r.content).toContain("def1"); // önceki kaynak korundu
      expect(r.content).toContain("cemos:pack:p2");
      expect(r.content).toContain("def2");
    }
  });

  it("aynı pack'in bloğu değişince güncellenir (diğerleri kalır)", () => {
    const existing =
      mk("p1", "def1").replace(/\n$/, "") + "\n\n" + packBlockMarkers("p2").open + "\ndef2\n" + packBlockMarkers("p2").close + "\n";
    const incoming = mk("p1", "def1-updated");
    const r = mergeSharedConceptFile(existing, incoming, "p1");
    expect(r.kind).toBe("changed");
    if (r.kind === "changed") {
      expect(r.content).toContain("def1-updated");
      expect(r.content).not.toContain("def1\n"); // eski p1 içeriği gitti
      expect(r.content).toContain("def2"); // p2 korundu
    }
  });
});
