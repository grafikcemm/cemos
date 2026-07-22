import {
  buildIntentUrl,
  type AdapterResult,
  type PrepareInput,
  type PublishAdapter,
} from "./contract";

/**
 * IntentPublishAdapter (ADR-025) — gerçek çalışan adaptör. "X'te aç" =
 * prepared; yayının kendisi kullanıcıda kalır, "Paylaşıldı olarak işaretle"
 * manuel onayı publishAttemptService.confirmManualPublish transaction'ında
 * succeeded'a geçirir. Bu adaptör HİÇBİR ağ isteği atmaz.
 */
export const intentPublishAdapter: PublishAdapter = {
  kind: "intent",

  async prepare(input: PrepareInput): Promise<AdapterResult> {
    return {
      ok: true,
      adapter: "intent",
      intentUrl: buildIntentUrl(input.text),
      externalId: null,
    };
  },

  // Intent akışında otomatik publish YOKTUR — succeeded geçişi yalnız manuel
  // onay transaction'ından gelir. Bu yol çağrılırsa sözleşme gereği reddet.
  async publish(): Promise<AdapterResult> {
    return {
      ok: false,
      adapter: "intent",
      code: "adapter_mismatch",
      message: "Intent adaptörü otomatik yayın yapamaz — manuel onay gerekir.",
      blockedExternal: false,
    };
  },
};
