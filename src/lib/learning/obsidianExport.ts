/**
 * CemOS Learn — Obsidian export tipli durum makinesi (4D). "null = her şey" sözleşmesi
 * KALKTI. Her kanal (zip / local_vault / github_vault) bağımsız TİPLİ sonuç döner:
 * yazılan / değişmemiş / başarısız / conflict sayıları + errorClass + güvenli hedef
 * etiketi + manifest hash. Secret / token / TAM yerel path burada TUTULMAZ.
 */

export type ExportChannel = "zip" | "local_vault" | "github_vault";

export type ChannelState =
  | "not_configured" // env yok (Vercel'de local fs, ya da github repo/token yok)
  | "not_ready" // pack QA'dan geçmedi → export edilemez
  | "prepared" // bundle hazır, dış yazma yapılmadı (zip indirme / dry preflight)
  | "running"
  | "succeeded" // en az bir dosya yazıldı, hata/conflict yok
  | "already_current" // her dosya zaten güncel (manifest aynı) → yazma yok
  | "partial" // bir kısım yazıldı, bir kısım başarısız/conflict
  | "conflict" // yalnız conflict (unmanaged/başka pack dosyası) — hiçbir şey yazılmadı
  | "failed"; // yazma denendi, hepsi başarısız

export type FileOutcome = "written" | "unchanged" | "failed" | "conflict";

export type ExportFileResult = {
  path: string;
  outcome: FileOutcome;
  errorClass?: string;
};

export type ChannelResult = {
  channel: ExportChannel;
  state: ChannelState;
  written: number;
  unchanged: number;
  failed: number;
  conflict: number;
  manifestHash: string | null;
  /** Secret/token/tam-path İÇERMEZ (ör. "yerel vault", "owner/repo/dir"). */
  targetLabel: string;
  /** Hedefin secret-olmayan kararlı parmak izi (attempt unique invariant). */
  targetFingerprint: string | null;
  errorClass?: string;
  files: ExportFileResult[];
  message?: string;
};

/** Configured değil → tek atışta not_configured sonucu. */
export function notConfigured(channel: ExportChannel, message: string): ChannelResult {
  return {
    channel,
    state: "not_configured",
    written: 0,
    unchanged: 0,
    failed: 0,
    conflict: 0,
    manifestHash: null,
    targetLabel: "yapılandırılmadı",
    targetFingerprint: null,
    files: [],
    message,
  };
}

/** Pack hazır değil → not_ready sonucu. */
export function notReady(channel: ExportChannel): ChannelResult {
  return {
    channel,
    state: "not_ready",
    written: 0,
    unchanged: 0,
    failed: 0,
    conflict: 0,
    manifestHash: null,
    targetLabel: "—",
    targetFingerprint: null,
    files: [],
    message: "Pack QA'dan geçmedi; yalnız hazır paket dışa aktarılabilir.",
  };
}

/**
 * Dosya sonuçlarından kanal durumunu türet. Sayıları + state'i verir. Öncelik:
 * hepsi unchanged → already_current; yazılan var + hata/conflict yok → succeeded;
 * kısmi ilerleme + hata/conflict → partial; yalnız conflict → conflict; hepsi fail → failed.
 */
export function aggregate(
  channel: ExportChannel,
  files: ExportFileResult[],
  manifestHash: string,
  targetLabel: string,
  targetFingerprint: string
): ChannelResult {
  const written = files.filter((f) => f.outcome === "written").length;
  const unchanged = files.filter((f) => f.outcome === "unchanged").length;
  const failed = files.filter((f) => f.outcome === "failed").length;
  const conflict = files.filter((f) => f.outcome === "conflict").length;

  let state: ChannelState;
  if (files.length === 0) {
    state = "already_current";
  } else if (failed === 0 && conflict === 0) {
    state = written > 0 ? "succeeded" : "already_current";
  } else if (written > 0 || unchanged > 0) {
    state = "partial";
  } else if (conflict > 0 && failed === 0) {
    state = "conflict";
  } else {
    state = "failed";
  }

  // Kanal errorClass'ı: ilk başarısız/conflict dosyanın sınıfı (özet).
  const firstProblem = files.find((f) => f.outcome === "failed" || f.outcome === "conflict");

  return {
    channel,
    state,
    written,
    unchanged,
    failed,
    conflict,
    manifestHash,
    targetLabel,
    targetFingerprint,
    errorClass: firstProblem?.errorClass,
    files,
  };
}
