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

  // NOTE (Phase 5F §6): the durable model profile is NOT hydrated here. Pulling
  // `settingsService` (→ Prisma) into instrumentation forces the Prisma client
  // into the instrumentation/edge webpack bundle, which fails to resolve
  // `node:child_process`. The durable profile is instead read server-side by the
  // node-runtime `/api/settings` GET and by `setModelProfile` (POST), each of
  // which converges `process.env.MODEL_PROFILE` so the synchronous `resolveModel`
  // role path honors the stored choice once the settings surface is touched in
  // that instance. Presets pin their own models and are unaffected either way.
}
