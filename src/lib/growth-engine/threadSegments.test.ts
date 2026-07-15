import { describe, it, expect } from "vitest";
import { parseThreadSegments, serializeThreadSegments } from "./threadSegments";

describe("threadSegments Zod sözleşmesi", () => {
  it("geçerli JSON → segment listesi", () => {
    const raw = JSON.stringify([{ text: "İlk" }, { text: "İkinci" }]);
    expect(parseThreadSegments(raw)).toEqual([{ text: "İlk" }, { text: "İkinci" }]);
  });

  it("null/boş/geçersiz JSON → null (fail-closed)", () => {
    expect(parseThreadSegments(null)).toBeNull();
    expect(parseThreadSegments("")).toBeNull();
    expect(parseThreadSegments("   ")).toBeNull();
    expect(parseThreadSegments("not json")).toBeNull();
    expect(parseThreadSegments("[]")).toBeNull(); // boş dizi → null
    expect(parseThreadSegments(JSON.stringify([{ notText: 1 }]))).toBeNull();
  });

  it("serialize → parse roundtrip", () => {
    const segs = [{ text: "a" }, { text: "b" }, { text: "c" }];
    expect(parseThreadSegments(serializeThreadSegments(segs))).toEqual(segs);
  });

  it("serialize fazladan alanı atar (yalnız text)", () => {
    const raw = serializeThreadSegments([{ text: "x", extra: 9 } as unknown as { text: string }]);
    expect(JSON.parse(raw)).toEqual([{ text: "x" }]);
  });
});
