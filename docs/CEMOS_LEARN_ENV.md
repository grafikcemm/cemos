# CemOS Learn — Environment

`.env.example` içinde "CemOS Learn" bölümünde listelenir. Gerçek değerler `.env.local`'a
(git'e girmez). Modül **mevcut** `OPENROUTER_API_KEY` + `DATABASE_URL`'i kullanır — yeni
zorunlu servis yok.

| Değişken | Default | Açıklama |
|---|---|---|
| `LEARN_ENABLED` | (boş = kapalı) | Server gate. `true` değilse route'lar `{code:"disabled"}` (404), cron sweep no-op. |
| `NEXT_PUBLIC_LEARN_ENABLED` | (boş = kapalı) | Client nav gate (build-time inline). Öğren alanında "CemOS Learn" sekmesini gösterir. `LEARN_ENABLED` ile birlikte `true` yapılmalı. |
| `LEARN_MONTHLY_BUDGET_USD` | `3` | Aylık öğrenme LLM bütçesi. `meta.purpose="learn_pack"` satırlarından sayılır; `yt_`/diğer bütçelerden ayrı. Dolunca işleme 429 ile duraklar. |

Devralınan (mevcut) değişkenler: `OPENROUTER_API_KEY`, `DATABASE_URL`, model override'ları
(`MODEL_PROFILE` vb.), `CRON_SECRET` (cron + same-origin guard).

**Aktif etme:** her ikisini de `true` yap, `npm run db:push`, redeploy. Kapatma: ikisini
boş bırak → modül tamamen dark olur, mevcut sistemler etkilenmez.

Secret koda yazılmaz, logda gösterilmez; OpenRouter anahtarı yalnız server-side.
