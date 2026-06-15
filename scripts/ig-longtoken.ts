/**
 * Kısa ömürlü Meta token → 60 günlük uzun token değişimi.
 * APP_ID/SECRET .env.local'den okunur; sonuç token EKRANA BASILMAZ, doğrudan
 * .env.local'deki META_ACCESS_TOKEN'a yazılır.
 *
 *   npx tsx scripts/ig-longtoken.ts <SHORT_LIVED_TOKEN>
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const short = process.argv[2];
if (!short) {
  console.error("Kullanım: npx tsx scripts/ig-longtoken.ts <SHORT_LIVED_TOKEN>");
  process.exit(1);
}

const id = process.env.META_APP_ID;
const secret = process.env.META_APP_SECRET;
const ver = process.env.META_GRAPH_VERSION || "v21.0";
if (!id || !secret) {
  console.error("META_APP_ID / META_APP_SECRET .env.local'de bulunamadı.");
  process.exit(1);
}

type ExchangeResp = { access_token?: string; expires_in?: number; error?: { message?: string } };

async function main() {
  const url =
    `https://graph.facebook.com/${ver}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${id}&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(short)}`;
  const res = await fetch(url);
  const j = (await res.json()) as ExchangeResp;
  if (!res.ok || !j.access_token) {
    console.error("Exchange başarısız:", j.error?.message || JSON.stringify(j).slice(0, 300));
    process.exit(1);
  }
  const days = j.expires_in ? Math.round(j.expires_in / 86400) : "?";

  const path = resolve(process.cwd(), ".env.local");
  let env = readFileSync(path, "utf-8");
  const line = `META_ACCESS_TOKEN="${j.access_token}"`;
  if (/^META_ACCESS_TOKEN=.*$/m.test(env)) {
    env = env.replace(/^META_ACCESS_TOKEN=.*$/m, line);
  } else {
    env += `${env.endsWith("\n") ? "" : "\n"}${line}\n`;
  }
  writeFileSync(path, env);

  console.log(`✅ Uzun token .env.local → META_ACCESS_TOKEN yazıldı. Geçerlilik: ~${days} gün.`);
  console.log("Dev server'ı restart et (Ctrl+C → npm run dev).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
