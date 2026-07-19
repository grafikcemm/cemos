import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeLocalVault } from "./localVault";
import type { ObsidianBundle, ObsidianFile } from "./obsidian";
import { MANAGED_FLAG, packBlockMarkers } from "./obsidianManifest";

function mkBundle(files: ObsidianFile[], packId = "pack_x111111", manifestHash = "h1"): ObsidianBundle {
  return {
    folderName: "F",
    packId,
    manifestHash,
    files,
    meta: {
      pipelineVersion: "v2",
      promptVersion: "v2",
      sourceBasis: "transcript",
      sourceKind: "youtube",
      qaVerdict: "pass",
      qaCoverage: 0.8,
      fileCount: files.length,
    },
  };
}

const ownedFile = (relPath: string, body: string, packId = "pack_x111111"): ObsidianFile => ({
  path: relPath,
  content: `---\n${MANAGED_FLAG}\ncemos_pack_id: ${packId}\n---\n${body}`,
  scope: "owned",
  packId,
});

let vault: string;
beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), "cemos-vault-"));
});
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true }).catch(() => {});
});

describe("writeLocalVault — temel yazma + idempotency", () => {
  it("taze vault → succeeded, dosya diskte", async () => {
    const b = mkBundle([ownedFile("CemOS Learn/a/A__x11111/A.md", "# A")]);
    const r = await writeLocalVault(b, vault);
    expect(r.state).toBe("succeeded");
    expect(r.written).toBe(1);
    const written = await fs.readFile(path.join(vault, "CemOS Learn/a/A__x11111/A.md"), "utf8");
    expect(written).toContain("# A");
    // targetLabel tam path SIZDIRMAZ
    expect(r.targetLabel).toBe("yerel vault");
    expect(r.targetLabel).not.toContain(vault);
  });

  it("aynı bundle tekrar → already_current (yeniden yazma yok)", async () => {
    const b = mkBundle([ownedFile("CemOS Learn/a/A__x11111/A.md", "# A")]);
    await writeLocalVault(b, vault);
    const r2 = await writeLocalVault(b, vault);
    expect(r2.state).toBe("already_current");
    expect(r2.unchanged).toBe(1);
    expect(r2.written).toBe(0);
  });
});

describe("writeLocalVault — conflict koruması", () => {
  it("unmanaged mevcut dosya → conflict (kullanıcı notu ezilmez)", async () => {
    const rel = "CemOS Learn/a/A__x11111/A.md";
    const abs = path.join(vault, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, "# BENİM ELLE YAZDIĞIM NOT", "utf8");
    const b = mkBundle([ownedFile(rel, "# A")]);
    const r = await writeLocalVault(b, vault);
    expect(r.state).toBe("conflict");
    expect(r.conflict).toBe(1);
    // dosya korundu
    expect(await fs.readFile(abs, "utf8")).toContain("ELLE YAZDIĞIM");
  });

  it("başka pack'in owned dosyası → conflict (other_pack)", async () => {
    const rel = "CemOS Learn/a/A__x11111/A.md";
    const abs = path.join(vault, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, `---\n${MANAGED_FLAG}\ncemos_pack_id: pack_OTHER99\n---\n# eski`, "utf8");
    const b = mkBundle([ownedFile(rel, "# A")]);
    const r = await writeLocalVault(b, vault);
    expect(r.state).toBe("conflict");
    expect(r.files[0].errorClass).toBe("other_pack");
  });

  it("path traversal → conflict path_escape, kök dışına yazılmaz", async () => {
    const evil: ObsidianFile = { path: "../../evil.md", content: "x", scope: "owned", packId: "pack_x111111" };
    const b = mkBundle([evil]);
    const r = await writeLocalVault(b, vault);
    expect(r.files[0].outcome).toBe("conflict");
    expect(r.files[0].errorClass).toBe("path_escape");
  });

  it("symlink/junction ile kök dışı → conflict symlink_escape", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cemos-outside-"));
    const linkDir = path.join(vault, "CemOS Learn", "link");
    await fs.mkdir(path.join(vault, "CemOS Learn"), { recursive: true });
    let junctionMade = false;
    try {
      await fs.symlink(outside, linkDir, "junction");
      junctionMade = true;
    } catch {
      // ortam symlink/junction desteklemiyor → sessiz atla
    }
    if (junctionMade) {
      const b = mkBundle([ownedFile("CemOS Learn/link/evil.md", "# x")]);
      const r = await writeLocalVault(b, vault);
      expect(r.files[0].outcome).toBe("conflict");
      expect(r.files[0].errorClass).toBe("symlink_escape");
      // dosya outside'a YAZILMADI
      await expect(fs.readFile(path.join(outside, "evil.md"), "utf8")).rejects.toBeDefined();
    }
    await fs.rm(outside, { recursive: true, force: true }).catch(() => {});
  });
});

describe("writeLocalVault — paylaşımlı kavram merge", () => {
  const sharedFile = (packId: string, body: string): ObsidianFile => {
    const { open, close } = packBlockMarkers(packId);
    return {
      path: "CemOS Learn/Kavramlar/Kavram.md",
      content: `---\n${MANAGED_FLAG}\ncemos_shared: true\n---\n# Kavram\n\n${open}\n${body}\n${close}\n`,
      scope: "shared",
      packId,
    };
  };

  it("ikinci pack'in kavram bloğu eklenir, ilkinki korunur", async () => {
    await writeLocalVault(mkBundle([sharedFile("p1", "def1")], "p1"), vault);
    const r2 = await writeLocalVault(mkBundle([sharedFile("p2", "def2")], "p2"), vault);
    expect(r2.written).toBe(1);
    const merged = await fs.readFile(path.join(vault, "CemOS Learn/Kavramlar/Kavram.md"), "utf8");
    expect(merged).toContain("def1"); // önceki kaynak korundu
    expect(merged).toContain("def2");
  });
});
