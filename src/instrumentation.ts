/**
 * Next.js instrumentation dosyası (node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/instrumentation.md ile doğrulandı):
 * `register()` yeni bir Next sunucu örneği başlarken BİR KEZ çağrılır ve
 * sunucu istek almadan önce tamamlanmak zorundadır — startup fail-fast'in
 * doğru yeri.
 *
 * İki startup kapısı (FIRST-SPRINT item 11 + 18):
 *  1. assertRequiredSecrets — eksik zorunlu secret'ı İSİM bazlı raporlar
 *     (değer asla loglanmaz) ve production'da başlatmayı durdurur.
 *  2. validatePresets — model preset lint'i: floating/pinned-olmayan veya
 *     katalog-dışı primary ve writer==judge ailesi build'i kırar.
 */
export async function register(): Promise<void> {
  // Edge runtime'da process.env erişimi kısıtlı ve Prisma zaten yok —
  // kapılar yalnız Node.js sunucusunda koşar (Next docs "Specifying the runtime").
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertRequiredSecrets } = await import("@/lib/config/requiredSecrets");
  const { validatePresets } = await import("@/lib/ai/presets");

  assertRequiredSecrets();
  validatePresets();

  // Durable model-profile hydration (Phase 5F §6): copy the persisted
  // OperatorSetting into process.env once per instance so the synchronous
  // `resolveModel` path honors the operator's stored choice instead of the
  // build-time env default. Fail-open — a missing table or unreachable DB at
  // boot must never block startup; getModelProfile already falls back to
  // env/default internally, and this guard covers import/connection errors.
  try {
    const { getModelProfile } = await import("@/lib/services/settingsService");
    await getModelProfile();
  } catch {
    /* fail-open: keep the env/default profile */
  }
}
