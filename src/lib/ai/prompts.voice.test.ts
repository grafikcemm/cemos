import { describe, it, expect } from "vitest";
import { buildDraftSystemPrompt, type DraftVoice } from "./prompts";
import { accountProfiles } from "@/lib/accounts";

/**
 * FIRST-SPRINT item 16 — VoiceProfile writer SYSTEM prompt'una bağlanır.
 * Tek enjeksiyon noktası: grounding'in eski §1.7 user-bloğu kaldırıldı.
 */
describe("buildDraftSystemPrompt — SES PROFİLİ (item 16)", () => {
  const profile = accountProfiles.grafikcem;

  const voice: DraftVoice = {
    personality: "sahadan konuşan pratik operatör",
    toneTags: ["dürüst", "net", "pratik"],
    vocabulary: ["test ettim", "iş akışı", "somut"],
    avoid: ["devrim niteliğinde", "inanılmaz"],
    rhythm: "kısa vuruşlar, satır araları",
    mission: "Türk tasarımcılara AI araçlarını sahadan öğretmek",
    pointOfView: "birinci tekil, deneyim aktaran",
    audience: "Türk tasarımcı ve founder kitlesi",
  };

  it("voice verildiğinde SES PROFİLİ bloğu system prompt'ta yer alır", () => {
    const prompt = buildDraftSystemPrompt(profile, voice);
    expect(prompt).toContain("SES PROFİLİ");
    expect(prompt).toContain("sahadan konuşan pratik operatör");
    expect(prompt).toContain("dürüst, net, pratik");
    expect(prompt).toContain("Misyon: Türk tasarımcılara AI araçlarını sahadan öğretmek");
    expect(prompt).toContain("Kaçındığı ifadeler: devrim niteliğinde, inanılmaz");
  });

  it("voice verilmezse blok eklenmez — mevcut prompt davranışı korunur", () => {
    const prompt = buildDraftSystemPrompt(profile);
    expect(prompt).not.toContain("SES PROFİLİ");
    // Çekirdek bloklar hâlâ orada.
    expect(prompt).toContain("TON KURALLARI");
    expect(prompt).toContain("HEDEF STİL ÖRNEKLERİ");
  });

  it("tamamen boş voice → blok eklenmez (şişme yok)", () => {
    const empty: DraftVoice = { toneTags: [], vocabulary: [], avoid: [] };
    const prompt = buildDraftSystemPrompt(profile, empty);
    expect(prompt).not.toContain("SES PROFİLİ");
  });
});
