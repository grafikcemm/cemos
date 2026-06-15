import { describe, it, expect } from "vitest";
import {
  getAllProfiles,
  getAccountProfile,
  getAccountProfileById,
  getAvailableModes,
  getDefaultMode,
  getForbiddenTerms,
  validateAccountHandle,
  buildAccountSystemPrompt,
  ACCOUNT_HANDLES
} from "./account-profiles";

describe("account-profiles", () => {
  describe("getAllProfiles", () => {
    it("returns exactly 2 profiles", () => {
      expect(getAllProfiles()).toHaveLength(2);
    });

    it("returns profiles for all 2 handles", () => {
      const handles = getAllProfiles().map((p) => p.handle);
      expect(handles).toContain("grafikcem");
      expect(handles).toContain("maskulenkod");
      expect(handles).not.toContain("pixelspor");
    });
  });

  describe("getAccountProfile", () => {
    it("returns grafikcem profile with correct fields", () => {
      const p = getAccountProfile("grafikcem");
      expect(p.handle).toBe("grafikcem");
      expect(p.displayName).toBe("GrafikCem");
      expect(p.persona).toBe("Pratik Tasarım × AI Operatörü (araçları sahada test edip dürüst yorumlayan, görsel üreten insider)");
      expect(p.language).toBe("Turkish");
      expect(p.maxChars).toBe(1500);
    });

    it("returns maskulenkod profile with correct fields", () => {
      const p = getAccountProfile("maskulenkod");
      expect(p.handle).toBe("maskulenkod");
      expect(p.persona).toBe("Maskülen Realist + Sistem Öğretmeni (erkekliği fikir olarak değil sistem olarak öğreten)");
      expect(p.maxChars).toBe(1200);
    });

    it("throws ZodError for invalid handle", () => {
      expect(() => getAccountProfile("invalid_account")).toThrow();
    });

    it("throws ZodError for empty string", () => {
      expect(() => getAccountProfile("")).toThrow();
    });
  });

  describe("validateAccountHandle", () => {
    it("returns true for valid handles", () => {
      for (const handle of ACCOUNT_HANDLES) {
        expect(validateAccountHandle(handle)).toBe(true);
      }
    });

    it("returns false for unknown handle", () => {
      expect(validateAccountHandle("unknownbrand")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(validateAccountHandle("")).toBe(false);
    });
  });

  describe("getAvailableModes", () => {
    it("grafikcem has tool_spotlight, visual_drop, hot_take, thread, repo_kaynak modes", () => {
      const modes = getAvailableModes("grafikcem").map((m) => m.id);
      expect(modes).toContain("tool_spotlight");
      expect(modes).toContain("visual_drop");
      expect(modes).toContain("hot_take");
      expect(modes).toContain("thread");
      expect(modes).toContain("repo_kaynak");
      expect(modes).toHaveLength(5);
    });

    it("maskulenkod has sistem_analizi, sosyal_gozlem, thread, hot_take, disiplin_notu modes", () => {
      const modes = getAvailableModes("maskulenkod").map((m) => m.id);
      expect(modes).toContain("sistem_analizi");
      expect(modes).toContain("sosyal_gozlem");
      expect(modes).toContain("thread");
      expect(modes).toContain("hot_take");
      expect(modes).toContain("disiplin_notu");
      expect(modes).toHaveLength(5);
    });

    it("each mode has non-empty id, label, and instruction", () => {
      for (const handle of ACCOUNT_HANDLES) {
        for (const mode of getAvailableModes(handle)) {
          expect(mode.id.length).toBeGreaterThan(0);
          expect(mode.label.length).toBeGreaterThan(0);
          expect(mode.instruction.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("getDefaultMode", () => {
    it("returns first mode as default for each account", () => {
      expect(getDefaultMode("grafikcem").id).toBe("tool_spotlight");
      expect(getDefaultMode("maskulenkod").id).toBe("sistem_analizi");
    });
  });

  describe("getForbiddenTerms", () => {
    it("returns non-empty forbidden list for each account", () => {
      for (const handle of ACCOUNT_HANDLES) {
        expect(getForbiddenTerms(handle).length).toBeGreaterThan(0);
      }
    });

    it("grafikcem forbidden list contains clickbait", () => {
      expect(getForbiddenTerms("grafikcem")).toContain("clickbait");
    });

    it("maskulenkod forbidden list contains terapist dili", () => {
      expect(getForbiddenTerms("maskulenkod")).toContain("terapist dili");
    });
  });

  describe("getAccountProfileById", () => {
    it("returns profile when handle is valid", () => {
      const profile = getAccountProfileById({ id: "some-cuid", handle: "grafikcem" });
      expect(profile).not.toBeNull();
      expect(profile?.handle).toBe("grafikcem");
    });

    it("returns null when handle is unknown", () => {
      const profile = getAccountProfileById({ id: "some-cuid", handle: "unknown" });
      expect(profile).toBeNull();
    });
  });

  describe("buildAccountSystemPrompt", () => {
    it("returns non-empty string for each account", () => {
      for (const handle of ACCOUNT_HANDLES) {
        const prompt = buildAccountSystemPrompt(handle);
        expect(prompt.length).toBeGreaterThan(0);
      }
    });

    it("grafikcem prompt contains persona and handle", () => {
      const prompt = buildAccountSystemPrompt("grafikcem");
      expect(prompt).toContain("@grafikcem");
      expect(prompt).toContain("Pratik Tasarım × AI Operatörü");
    });

    it("grafikcem prompt does NOT contain maskulenkod persona", () => {
      const prompt = buildAccountSystemPrompt("grafikcem");
      expect(prompt).not.toContain("Ayna Tutan Adam");
    });

    it("grafikcem prompt does NOT contain maskulenkod tone keyword", () => {
      const prompt = buildAccountSystemPrompt("grafikcem");
      // maskulenkod tone: "doğrudan, sert, yumuşatmasız, otoriter"
      expect(prompt).not.toContain("yumuşatmasız");
    });

    it("uses specified mode when provided", () => {
      const prompt = buildAccountSystemPrompt("grafikcem", "thread");
      expect(prompt).toContain("thread");
      expect(prompt).toContain("Thread");
    });

    it("falls back to default mode for unknown modeId", () => {
      const prompt = buildAccountSystemPrompt("grafikcem", "nonexistent_mode");
      expect(prompt).toContain("tool_spotlight");
    });

    it("prompt includes max char limit", () => {
      const prompt = buildAccountSystemPrompt("grafikcem");
      expect(prompt).toContain("1500");
    });

    it("prompt includes forbidden section", () => {
      const prompt = buildAccountSystemPrompt("maskulenkod");
      expect(prompt).toContain("YASAKLAR:");
      expect(prompt).toContain("terapist dili");
    });
  });
});
