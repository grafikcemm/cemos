import { describe, it, expect } from "vitest";
import { runDeterministicHeuristics } from "./heuristics";

describe("heuristics", () => {
  it("should catch mojibake as a blocker", () => {
    const textsWithMojibake = [
      "Bozuk Ä°karakter",
      "Hatalı ÅŸeyler",
      "Garip Ã§Ä±ktÄ±",
      "Böyle â€œtırnakâ€",
      "Bilinmeyen ï¿½ karakter",
      "Bilinmeyen \uFFFD karakter",
    ];

    for (const text of textsWithMojibake) {
      const res = runDeterministicHeuristics(text);
      expect(res.passed).toBe(false);
      const mojibakeIssue = res.issues.find(
        (i) => i.code === "mojibake_blocker" || i.code === "replacement_character"
      );
      expect(mojibakeIssue).toBeDefined();
      expect(mojibakeIssue?.severity).toBe("blocker");
    }
  });

  it("should pass normal Turkish text", () => {
    const text = "Bu tamamen normal ve düzgün bir Türkçe metindir.";
    const res = runDeterministicHeuristics(text);
    expect(res.passed).toBe(true);
  });

  it("flags below-min-chars as a warning, never a blocker", () => {
    // 23 chars, tier minimum 140 (punch). Too thin for the tier, but valid content.
    const text = "Kısa ama temiz bir not.";
    const res = runDeterministicHeuristics(text, "TWEET", 280, undefined, undefined, 140);
    const issue = res.issues.find((i) => i.code === "below_min_chars");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    // Warning must not hard-block valid short content.
    expect(res.passed).toBe(true);
  });

  it("does not flag below-min when minCharsLimit is 0 (variable/thread)", () => {
    const text = "Kısa.";
    const res = runDeterministicHeuristics(text, "TWEET", 280, undefined, undefined, 0);
    expect(res.issues.find((i) => i.code === "below_min_chars")).toBeUndefined();
  });
});
