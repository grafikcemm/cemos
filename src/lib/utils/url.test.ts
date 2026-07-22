import { describe, it, expect } from "vitest";
import { safeExternalHref } from "./url";

describe("safeExternalHref", () => {
  it("allows http/https/mailto", () => {
    expect(safeExternalHref("https://example.com")).toBe("https://example.com");
    expect(safeExternalHref("http://example.com/x?y=1")).toBe("http://example.com/x?y=1");
    expect(safeExternalHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("rejects javascript: / data: / vbscript:", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalHref("data:text/html,<script>1</script>")).toBeUndefined();
    expect(safeExternalHref("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("rejects unparseable / empty / nullish", () => {
    expect(safeExternalHref("not a url")).toBeUndefined();
    expect(safeExternalHref("")).toBeUndefined();
    expect(safeExternalHref(null)).toBeUndefined();
    expect(safeExternalHref(undefined)).toBeUndefined();
  });
});
