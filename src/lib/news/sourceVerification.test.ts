import { describe, it, expect } from "vitest";
import {
  classifySourceVerification,
  isOfficialSourceUrl,
  titlesMatch,
} from "./sourceVerification";

const subject = (overrides: Partial<{ originalTitle: string; url: string; newsSourceId: string | null }> = {}) => ({
  originalTitle: "OpenAI releases GPT-5 with new reasoning",
  url: "https://techcrunch.com/openai-gpt5",
  newsSourceId: "src-a",
  ...overrides,
});

describe("titlesMatch", () => {
  it("matches the same story across morphological variants", () => {
    expect(
      titlesMatch(
        "OpenAI releases GPT-5 with new reasoning",
        "GPT-5 released by OpenAI: reasoning upgrade",
      ),
    ).toBe(true);
  });

  it("does not match different announcements from the same vendor", () => {
    // Shared tokens after noise removal: only "openai" — below MIN_SHARED_TOKENS.
    expect(titlesMatch("OpenAI announces GPT-5", "OpenAI announces Sora video model")).toBe(false);
  });

  it("does not match unrelated stories", () => {
    expect(titlesMatch("OpenAI announces GPT-5", "Anthropic ships Claude memory feature")).toBe(false);
  });

  it("handles empty titles without crashing", () => {
    expect(titlesMatch("", "OpenAI announces GPT-5")).toBe(false);
  });
});

describe("isOfficialSourceUrl", () => {
  it("recognizes vendor domains and subdomains", () => {
    expect(isOfficialSourceUrl("https://openai.com/blog/gpt-5")).toBe(true);
    expect(isOfficialSourceUrl("https://www.anthropic.com/news/claude")).toBe(true);
    expect(isOfficialSourceUrl("https://huggingface.co/blog/foo")).toBe(true);
  });

  it("rejects editorial domains and malformed urls", () => {
    expect(isOfficialSourceUrl("https://techcrunch.com/x")).toBe(false);
    expect(isOfficialSourceUrl("not-a-url")).toBe(false);
    expect(isOfficialSourceUrl(null)).toBe(false);
  });

  it("does not let a lookalike domain spoof the allowlist", () => {
    expect(isOfficialSourceUrl("https://fakeopenai.com/blog")).toBe(false);
  });
});

describe("classifySourceVerification", () => {
  const sameStory = "GPT-5 released by OpenAI: reasoning upgrade";

  it("returns editorial_confirmed when one other source reports the story", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: sameStory, newsSourceId: "src-b" },
    ]);
    expect(verdict).toBe("editorial_confirmed");
  });

  it("returns multi_source_confirmed when two+ distinct sources report it", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: sameStory, newsSourceId: "src-b" },
      { originalTitle: "OpenAI GPT-5 reasoning model is out", newsSourceId: "src-c" },
    ]);
    expect(verdict).toBe("multi_source_confirmed");
  });

  it("ignores duplicates from the same source (including the subject itself)", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: sameStory, newsSourceId: "src-a" }, // own source — not corroboration
      { originalTitle: subject().originalTitle, newsSourceId: "src-a" }, // subject row itself
    ]);
    expect(verdict).toBe("single_source");
  });

  it("counts one source only once even with multiple matching copies", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: sameStory, newsSourceId: "src-b" },
      { originalTitle: "OpenAI GPT-5 reasoning model is out", newsSourceId: "src-b" },
    ]);
    expect(verdict).toBe("editorial_confirmed");
  });

  it("returns official_only for vendor-blog items without corroboration", () => {
    const verdict = classifySourceVerification(
      subject({ url: "https://openai.com/blog/gpt-5" }),
      [{ originalTitle: "Anthropic ships Claude memory", newsSourceId: "src-b" }],
    );
    expect(verdict).toBe("official_only");
  });

  it("returns single_source for uncorroborated editorial items", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: "Anthropic ships Claude memory", newsSourceId: "src-b" },
      { originalTitle: "Figma adds AI design search", newsSourceId: "src-c" },
    ]);
    expect(verdict).toBe("single_source");
  });

  it("skips candidates without a source id", () => {
    const verdict = classifySourceVerification(subject(), [
      { originalTitle: sameStory, newsSourceId: null },
    ]);
    expect(verdict).toBe("single_source");
  });
});
