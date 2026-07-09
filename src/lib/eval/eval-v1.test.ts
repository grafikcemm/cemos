import { describe, it, expect } from "vitest";
import {
  scoreKaynakGuveni,
  scoreTazelik,
  scoreUretilebilirlik,
  scoreYayinaHazir,
  aggregateComposite,
  buildSubscores14,
  ENGAGEMENT_CAP,
} from "./subscores14";
import { evaluateLesson, mannWhitneyP, MIN_SUPPORT } from "./lessonGate";
import { cohensKappa, assessSubscoreConfidence, KAPPA_FLOOR } from "./calibration";
import { normalizePerformance } from "./performance";

const HOUR = 3_600_000;

describe("deterministik alt-skorlar [D]", () => {
  it("kaynak güveni: tier + corroboration (3 üstü doymuş)", () => {
    expect(scoreKaynakGuveni({ sourceTier: "verified", corroborations: 0 })).toBe(70);
    expect(scoreKaynakGuveni({ sourceTier: "unknown", corroborations: 5 })).toBe(55);
  });

  it("tazelik: 18 saatte yarılanır", () => {
    const now = 1_000_000_000_000;
    expect(scoreTazelik({ publishedAtMs: now, nowMs: now })).toBe(100);
    expect(scoreTazelik({ publishedAtMs: now - 18 * HOUR, nowMs: now })).toBe(50);
  });

  it("üretilebilirlik: mock=0; limit aşımı + eksik görsel ceza", () => {
    expect(
      scoreUretilebilirlik({ charCount: 100, maxChars: 280, needsImage: false, imageReady: false, usedMock: true })
    ).toBe(0);
    expect(
      scoreUretilebilirlik({ charCount: 300, maxChars: 280, needsImage: true, imageReady: false, usedMock: false })
    ).toBe(20);
  });

  it("yayına-hazır: leak/lint/format kapıları", () => {
    expect(scoreYayinaHazir({ highLeakCount: 0, lintErrorCount: 0, formatValid: true })).toBe(100);
    expect(scoreYayinaHazir({ highLeakCount: 1, lintErrorCount: 0, formatValid: true })).toBe(0);
  });
});

describe("aggregateComposite — veto + cap", () => {
  it("#14 vetosu: diğer 13 mükemmel olsa da kompozit 0", () => {
    const scores = buildSubscores14(
      Object.fromEntries(
        Object.keys(buildSubscores14({})).map((k) => [k, 100])
      ) as never
    );
    scores.yayinaHazir = 0;
    const r = aggregateComposite(scores);
    expect(r.vetoed).toBe(true);
    expect(r.composite).toBe(0);
  });

  it("#11/#12 kompozite CAP'li girer (bait freni)", () => {
    const base = buildSubscores14({ yayinaHazir: 100 });
    const spiky = { ...base, paylasim: 100, tartisma: 100 };
    const r = aggregateComposite(spiky);
    expect(r.cappedInputs.paylasim).toBe(ENGAGEMENT_CAP);
    expect(r.cappedInputs.tartisma).toBe(ENGAGEMENT_CAP);
  });

  it("buildSubscores14 daima 14 anahtar döner (UI sözleşmesi)", () => {
    expect(Object.keys(buildSubscores14({}))).toHaveLength(14);
  });
});

describe("lessonGate — iki kapı + marka vetosu (false-learning)", () => {
  const brandOk = {
    medianEditDistanceWith: 0.1,
    medianEditDistanceWithout: 0.1,
    rejectRateWith: 0.1,
    rejectRateWithout: 0.1,
  };

  it("TEK outlier post ASLA kural olamaz", () => {
    const v = evaluateLesson({
      lessonKey: "tek-sansli",
      withLesson: [9.5], // devasa tek örnek
      without: [0.1, 0.2, 0.1, 0.15],
      brand: brandOk,
    });
    expect(v.promoted).toBe(false);
    expect(v.reason).toBe("insufficient_support");
    expect(MIN_SUPPORT).toBe(3);
  });

  it("sentetik clickbait: engagement artar AMA edit-distance artar → MARKA VETOSU", () => {
    const v = evaluateLesson({
      lessonKey: "clickbait-hook",
      withLesson: [2.5, 3.1, 2.8, 3.4],
      without: [0.2, 0.1, 0.3, 0.2, 0.1],
      brand: {
        medianEditDistanceWith: 0.45, // operatör sürekli düzeltiyor
        medianEditDistanceWithout: 0.12,
        rejectRateWith: 0.1,
        rejectRateWithout: 0.1,
      },
    });
    expect(v.promoted).toBe(false);
    expect(v.reason).toBe("brand_veto_edit_distance");
  });

  it("ret oranını artıran ders de veto yer", () => {
    const v = evaluateLesson({
      lessonKey: "ret-artiran",
      withLesson: [2, 2.2, 2.4],
      without: [0.5, 0.4, 0.6],
      brand: { ...brandOk, rejectRateWith: 0.4, rejectRateWithout: 0.1 },
    });
    expect(v.reason).toBe("brand_veto_reject_rate");
  });

  it("anlamlı + marka-temiz ders terfi eder", () => {
    const v = evaluateLesson({
      lessonKey: "gercek-ders",
      withLesson: [2.1, 2.4, 2.2, 2.6, 2.3],
      without: [0.4, 0.5, 0.3, 0.45, 0.5, 0.4],
      brand: brandOk,
    });
    expect(v.promoted).toBe(true);
    expect(v.pApprox).not.toBeNull();
    expect(v.pApprox!).toBeLessThan(0.05);
  });

  it("örtüşen dağılımlar anlamlı DEĞİL", () => {
    const v = evaluateLesson({
      lessonKey: "gurultu",
      withLesson: [1.0, 1.2, 0.9, 1.1],
      without: [1.05, 1.1, 0.95, 1.0, 1.15],
      brand: brandOk,
    });
    expect(v.promoted).toBe(false);
    expect(v.reason).toBe("not_significant");
  });

  it("mannWhitneyP küçük örneklemde null (karar yok)", () => {
    expect(mannWhitneyP([1, 2], [3, 4, 5])).toBeNull();
  });
});

describe("kalibrasyon — Cohen's κ", () => {
  it("tam uyum κ=1, ters uyum negatif", () => {
    const agree = Array.from({ length: 10 }, (_, i) => ({ judge: i % 2 === 0, human: i % 2 === 0 }));
    expect(cohensKappa(agree)).toBe(1);
    const disagree = Array.from({ length: 10 }, (_, i) => ({ judge: i % 2 === 0, human: i % 2 !== 0 }));
    expect(cohensKappa(disagree)!).toBeLessThan(0);
  });

  it("κ tabanı altı → düşük güven (kompozit dışı)", () => {
    const noisy = [
      ...Array.from({ length: 6 }, () => ({ judge: true, human: true })),
      ...Array.from({ length: 5 }, () => ({ judge: true, human: false })),
      ...Array.from({ length: 4 }, () => ({ judge: false, human: true })),
      ...Array.from({ length: 5 }, () => ({ judge: false, human: false })),
    ];
    const a = assessSubscoreConfidence("kancaGucu", noisy);
    expect(a.kappa!).toBeLessThan(KAPPA_FLOOR);
    expect(a.lowConfidence).toBe(true);
  });

  it("etiket yokken karar verilmez (kappa null, lowConfidence false)", () => {
    const a = assessSubscoreConfidence("tutma", []);
    expect(a.kappa).toBeNull();
    expect(a.lowConfidence).toBe(false);
  });
});

describe("performans normalizasyonu — cold start tabanı", () => {
  it("min örneklem altı karar YOK", () => {
    const r = normalizePerformance({
      value: 100, baselineMedian: 50, baselineStd: 10,
      baselineSampleSize: 2, impressions: 1000, ageDays: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cold_start_sample");
  });

  it("min impression altı karar YOK", () => {
    const r = normalizePerformance({
      value: 100, baselineMedian: 50, baselineStd: 10,
      baselineSampleSize: 10, impressions: 50, ageDays: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cold_start_impressions");
  });

  it("z-score + time-decay", () => {
    const r = normalizePerformance({
      value: 70, baselineMedian: 50, baselineStd: 10,
      baselineSampleSize: 10, impressions: 1000, ageDays: 30,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.zScore).toBe(2);
      expect(r.decayed).toBe(1); // 30g = yarı ömür
    }
  });
});
