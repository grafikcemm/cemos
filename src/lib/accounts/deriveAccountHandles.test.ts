import { describe, it, expect } from "vitest";
import { deriveAccountHandles } from "./deriveAccountHandles";

describe("deriveAccountHandles (Batch-C hesap listesi türetimi)", () => {
  it("DB hesapları doluyken handle listesini DB sırasıyla döner", () => {
    const accounts = [
      { id: "acc-g", handle: "grafikcem" },
      { id: "acc-m", handle: "maskulenkod" },
      { id: "acc-p", handle: "pixelspor" },
    ];
    expect(deriveAccountHandles(accounts, ["grafikcem", "maskulenkod"])).toEqual([
      "grafikcem",
      "maskulenkod",
      "pixelspor",
    ]);
  });

  it("liste boşken (DB down / henüz yüklenmedi) bootstrap fallback'i döner", () => {
    expect(deriveAccountHandles([], ["grafikcem", "maskulenkod"])).toEqual([
      "grafikcem",
      "maskulenkod",
    ]);
  });

  it("fallback dizisini mutasyona uğratmaz — her çağrıda yeni array döner", () => {
    const fallback = ["grafikcem", "maskulenkod"];
    const result = deriveAccountHandles([], fallback);
    expect(result).not.toBe(fallback);
    expect(result).toEqual(fallback);
  });

  it("DB tek hesap döndürse bile yalnız o hesabı listeler — bootstrap'e geri düşmez", () => {
    const accounts = [{ id: "acc-p", handle: "pixelspor" }];
    expect(deriveAccountHandles(accounts, ["grafikcem", "maskulenkod"])).toEqual(["pixelspor"]);
  });
});
