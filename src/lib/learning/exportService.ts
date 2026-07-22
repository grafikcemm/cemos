/**
 * CemOS Learn — Obsidian export servisi (4D). Tek giriş noktası: pack + kanal →
 * assemble DTO → ready-gate → deterministik bundle → kanal yazıcısı → kalıcı audit
 * (LearnExportAttempt). idempotencyKey verilmişse önce kontrol → deduped (yeniden
 * yazma YOK). "integration_suggestions tamamlandı" ASLA "export başarılı" demez —
 * gerçek durum attempt contract'ından okunur.
 */

import { assemblePackExport } from "./packExport";
import { buildObsidianBundle } from "./obsidian";
import { getObsidianVaultPath } from "./learnConfig";
import { writeLocalVault } from "./localVault";
import { writeGithubVault, isGithubConfigured } from "./githubVault";
import {
  notConfigured,
  notReady,
  type ChannelResult,
  type ChannelState,
  type ExportChannel,
} from "./obsidianExport";
import { learnExportRepo } from "@/lib/db/learnExportRepo";
import type { LearnExportAttempt } from "@/generated/prisma/client";

export type ChannelConfig = {
  channel: ExportChannel;
  configured: boolean;
  envNames: string[];
  note: string;
};

/** Kanal yapılandırma durumu (UI paneli + entegrasyonlar). Secret VALUE yok, env NAME'ler. */
export function channelStatuses(): ChannelConfig[] {
  return [
    { channel: "zip", configured: true, envNames: [], note: "Tarayıcıda ZIP indir (dış yazma yok)." },
    {
      channel: "local_vault",
      configured: getObsidianVaultPath() !== null,
      envNames: ["OBSIDIAN_VAULT_PATH"],
      note: "Yerel Obsidian vault (Node fs). Vercel/serverless'te KALICI DEĞİL — yalnız yerel çalıştırmada.",
    },
    {
      channel: "github_vault",
      configured: isGithubConfigured(),
      envNames: ["OBSIDIAN_GITHUB_REPO", "OBSIDIAN_GITHUB_TOKEN"],
      note: "GitHub vault reposu (Obsidian Git eklentisi çeker). Vercel'de kalıcı export yolu.",
    },
  ];
}

function labelForChannel(channel: string): string {
  if (channel === "local_vault") return "yerel vault";
  if (channel === "github_vault") return "GitHub vault";
  return "ZIP";
}

/** Kayıtlı denemeyi ChannelResult'a çevir (idempotent dedup dönüşü). */
function fromAttempt(a: LearnExportAttempt): ChannelResult {
  return {
    channel: a.channel as ExportChannel,
    state: a.state as ChannelState,
    written: a.writtenCount,
    unchanged: a.unchangedCount,
    failed: a.failedCount,
    conflict: a.conflictCount,
    manifestHash: a.manifestHash,
    targetLabel: labelForChannel(a.channel),
    targetFingerprint: a.targetFingerprint,
    errorClass: a.errorClass ?? undefined,
    files: [],
    message: "önceki denemeyle aynı (idempotent — yeniden yazılmadı)",
  };
}

export type ExportOutcome =
  | { ok: false; reason: "not_found" }
  | { ok: true; result: ChannelResult };

/**
 * Bir pack'i bir kanala export eder. Pack yok → not_found. Hazır değil → not_ready
 * (attempt KAYDEDİLMEZ — hiçbir şey olmadı). Kanal configured değil → not_configured.
 * Gerçek yazma denemesi → LearnExportAttempt upsert (composite idempotent).
 */
export async function exportPackToChannel(
  packId: string,
  channel: ExportChannel,
  opts: { idempotencyKey?: string | null } = {}
): Promise<ExportOutcome> {
  // Client idempotency: aynı key ikinci kez → kayıtlı sonucu döndür (yeniden yazma yok).
  if (opts.idempotencyKey) {
    const prior = await learnExportRepo.findByIdempotencyKey(opts.idempotencyKey);
    if (prior) return { ok: true, result: fromAttempt(prior) };
  }

  const pack = await assemblePackExport(packId);
  if (!pack) return { ok: false, reason: "not_found" };
  if (pack.status !== "ready") return { ok: true, result: notReady(channel) };

  const bundle = buildObsidianBundle(pack);
  const startedAt = new Date();

  let result: ChannelResult;
  if (channel === "local_vault") {
    const vault = getObsidianVaultPath();
    result = vault
      ? await writeLocalVault(bundle, vault)
      : notConfigured("local_vault", "OBSIDIAN_VAULT_PATH ayarlı değil (ZIP ile indirebilirsiniz).");
  } else if (channel === "github_vault") {
    result = await writeGithubVault(bundle);
  } else {
    // zip: dış yazma yok — bundle hazır (client indirir). Prepared durumu.
    result = {
      channel: "zip",
      state: "prepared",
      written: 0,
      unchanged: 0,
      failed: 0,
      conflict: 0,
      manifestHash: bundle.manifestHash,
      targetLabel: "ZIP",
      targetFingerprint: null,
      files: [],
      message: "Bundle hazır — tarayıcıda ZIP indirilir.",
    };
  }

  // Kalıcı audit: yalnız gerçek hedefe yazma denendiyse (targetFingerprint var).
  // not_configured / not_ready / prepared kaydedilmez (hiçbir şey olmadı).
  if (result.targetFingerprint && result.state !== "not_configured") {
    try {
      await learnExportRepo.record({
        packId,
        channel,
        targetFingerprint: result.targetFingerprint,
        manifestHash: result.manifestHash ?? bundle.manifestHash,
        state: result.state,
        writtenCount: result.written,
        unchangedCount: result.unchanged,
        failedCount: result.failed,
        conflictCount: result.conflict,
        errorClass: result.errorClass ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        startedAt,
        finishedAt: new Date(),
      });
    } catch (err) {
      // Audit yazımı başarısızsa export sonucunu bozma (fail-soft) — ama sessiz değil.
      console.warn(`[learn] export audit kaydı başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: true, result };
}

/** Pack'in son export durumunu kanal başına döndür (UI paneli okur). */
export async function latestExportByChannel(
  packId: string
): Promise<Record<string, ChannelResult>> {
  const attempts = await learnExportRepo.listForPack(packId);
  const byChannel: Record<string, ChannelResult> = {};
  for (const a of attempts) {
    if (!byChannel[a.channel]) byChannel[a.channel] = fromAttempt(a);
  }
  return byChannel;
}
