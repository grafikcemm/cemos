"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { fetchJson } from "@/lib/utils/safeFetch";

type Sample = { key: string; label: string; observed: number; floor: number; sufficient: boolean; note: string };
type EvalSummary = { present: boolean; status: string | null; policyVersion: string | null; passed: number; failed: number; at: string | null };
type CalibrationStatus = {
  outcomeCalibrated: boolean;
  reason: string;
  samples: Sample[];
  normalization: { active: boolean; note: string };
  thresholds: { readinessPolicyVersion: string; provisional: boolean; note: string };
  eval: { registryContract: EvalSummary; golden: EvalSummary };
  blockers: string[];
  sectionErrors: string[];
};

/**
 * ADR-046: dürüst kalite-kalibrasyon durumu. Sistem yüzeyinde "kalibre edildi"
 * yalanını GÖRÜNÜR biçimde reddeder — gerçek sonuç örneklemi yetersizse açıkça
 * "kalibre değil" der; sahte skor/tamamlanmışlık göstermez.
 */
export default function CalibrationStatusCard() {
  const [status, setStatus] = useState<CalibrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchJson<{ status: CalibrationStatus }>("/api/quality/calibration")
      .then((d) => {
        if (mounted) setStatus(d.status);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Kalibrasyon durumu alınamadı");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <Card variant="default" padded>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Kalite kalibrasyonu</div>
        <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--status-error)" }}>Yüklenemedi: {error}</div>
      </Card>
    );
  }

  return (
    <Card variant="default" padded>
      <div data-testid="calibration-status" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>Kalite kalibrasyonu</span>
          {status ? (
            <span data-testid="calibration-verdict">
              <Badge variant={status.outcomeCalibrated ? "success" : "yellow"} size="xs">
                {status.outcomeCalibrated ? "sonuç-kalibre" : "KALİBRE DEĞİL"}
              </Badge>
            </span>
          ) : (
            <Badge variant="muted" size="xs">yükleniyor…</Badge>
          )}
        </div>

        {status && (
          <>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{status.reason}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {status.samples.map((s) => (
                <div key={s.key} data-testid={`calib-sample-${s.key}`} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: "var(--text-xs)" }}>
                  <Badge variant={s.sufficient ? "success" : "muted"} size="xs">
                    {s.observed}/{s.floor}
                  </Badge>
                  <span style={{ color: "var(--text-primary)" }}>{s.label}</span>
                  <span style={{ color: "var(--text-muted)" }}>· {s.note}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.55 }}>
              {!status.normalization.active && (
                <div>
                  <Badge variant="yellow" size="xs">normalize değil</Badge> {status.normalization.note}
                </div>
              )}
              {status.thresholds.provisional && (
                <div>
                  <Badge variant="muted" size="xs">{status.thresholds.readinessPolicyVersion}</Badge> {status.thresholds.note}
                </div>
              )}
              <div>
                <Badge variant="muted" size="xs">
                  eval: {status.eval.registryContract.present ? `${status.eval.registryContract.status} ${status.eval.registryContract.passed}/${status.eval.registryContract.passed + status.eval.registryContract.failed}` : "hiç koşmadı"}
                </Badge>{" "}
                registry hermetik ($0); canlı golden {status.eval.golden.present ? status.eval.golden.status : "yok"}.
              </div>
            </div>

            {status.blockers.length > 0 && (
              <details>
                <summary style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", cursor: "pointer" }}>
                  Canlı sonuç beslemeleri neden yok ({status.blockers.length}) — BLOCKED-EXTERNAL
                </summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                  {status.blockers.map((b, i) => (
                    <li key={i} style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>{b}</li>
                  ))}
                </ul>
              </details>
            )}

            {status.sectionErrors.length > 0 && (
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--status-warn-text)" }}>
                Bazı bölümler okunamadı ({status.sectionErrors.length}) — diğerleri etkilenmez.
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
