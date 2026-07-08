# CemOS V2 — Final Evaluation Spec

> **Bağlayıcı girdiler:** [RESEARCH-SYNTHESIS.md](./RESEARCH-SYNTHESIS.md) (C3, C7, C9, D5-D6, §5) + [research/07-evaluation-learning-loop.md](./research/07-evaluation-learning-loop.md) + [research/_repo-baseline.md](./research/_repo-baseline.md).
> **Amaç:** taslak kalitesini ÖLÇÜLEBİLİR yapmak ve false learning'i engellemek. Dashboard eklemek değil. Tarih: 2026-07-08.

---

## 1. İlkeler

1. **"Viral olabilir" tek başına ASLA gösterilmez** — UI her zaman ayrışık alt-sinyaller + (isteğe bağlı) şeffaf, ağırlığı görünür bir kompozit gösterir.
2. **Deterministik-önce:** 14 alt-skorun 7'si saf kod ($0). LLM yalnız gerçek yargı gereken yerde.
3. **Writer ≠ judge ailesi — ZORUNLU registry testi.** Writer = Anthropic (sonnet-5), judge = OpenAI (`cemos-final-judge` primary gpt-5.5; C3). Self-preference bias kanıtlı (Panickssery NeurIPS 2024, Wataoka 2024).
4. **Binary rubric > Likert.** Her [J] alt-skoru küçük evet/hayır kontrol setinin agregasyonu; ham "0-100 ver" yasak.
5. **Tüm judge girdisi untrusted-fenced** (`wrapUntrustedData`), sıra rastgeleleştirilir, uzunluk normalize edilir.

## 2. 14 alt-skor (tam tablo — rapor 07 §10.1)

[D] deterministik · [J] LLM-judge (tek batched çağrı).

| # | Alt-skor (TR) | Sinyal | Tip | Rubrik özü | Bugünkü karşılık |
|---|---|---|---|---|---|
| 1 | Kaynak Güveni | seed güvenilir mi | [D] | kaynak tier + corroboration sayısı | buzzScore girdileri |
| 2 | Tazelik | ne kadar güncel | [D] | half-life decay (18h şablonu) | buzzScore recency |
| 3 | İlgi | hesabın konusu mu | [D]+[J] | konu-centroid cosine + on-topic Y/N | xValueScore kısmi |
| 4 | Hesap Uyumu | doğru hesap mı | [J]+[D] | audience/mandate/off-brand kontrolleri | routeItem, personaMatch |
| 5 | Ses Uyumu | "ben" gibi mi | [J]+[D] | banned-phrase/leak auto-fail + VoiceProfile ton eşleşmesi | personaMatchScore, lint |
| 6 | Özgünlük | rehash değil mi | [D]+[J] | max-cosine kendi geçmişine (yüksek benzerlik → düşük) + novelty | noveltyScore, embeddingJson |
| 7 | Bilgi Değeri | okur ne kazanıyor | [J] | somut iddia / non-obvious / eyleme dönüştürülebilir | xValueScore |
| 8 | Kanca Gücü | ilk satır durduruyor mu | [J]+[D] | uzunluk bandı + curiosity/sayı işaretleri + stop-scroll Y/N | hookStrengthScore |
| 9 | Tutma | kanca karşılığını veriyor mu | [J] | payoff≡hook, filler yok, tutarlılık | payoff/nextMove |
| 10 | Kaydetme | bookmark değeri | [J] | yeniden kullanılabilir fayda / liste / kaynak | yeni |
| 11 | Paylaşım | paylaşana kimlik/statü | [J] | identity sinyali, başkasına faydalı — **ağırlık CAPLİ** | viralScore kısmi |
| 12 | Tartışma | gerçek reply daveti | [J] | net duruş/açık soru + **bait/toksisite vetosu** — ağırlık CAPLİ | viralScore kısmi |
| 13 | Üretilebilirlik | şimdi shiplenebilir mi | [D] | karakter/format/asset bağımlılığı | usedMock, image flag |
| 14 | **Yayına Hazır** | tüm sert kapılar | [D] **VETO** | leak=0 AND lint pass AND format valid — geçmezse diğerleri ne olursa olsun `needs_edit` | publishScore, lintReport |

**Agregasyon:** #14 veto kapısı, ağırlıklı terim DEĞİL. #11/#12 kompozitte caplenir (bait-kovalamayı yapısal engeller). Kompozit yalnız sıralama içindir ve HER ZAMAN 14 çubukla yan yana render edilir.
**Maliyet şekli:** #1,2,13,14 tamamen [D]; #3,5,6 [D]-çekirdek + [J]-onay; #4,7,8,9,10,11,12 → **tek batched structured çağrı** (`cemos-final-judge`, purpose `judge_`, Zod + 1 repair retry, `generateJsonGated`) — bugünkü tek viralJudge adımının maliyetine eşdeğer, yalnız top-3 finaliste.

## 3. İnsan sinyalleri (Sprint 1'de başlar)

- **Edit-distance:** normalized Levenshtein(`FeedbackEvent.originalContent`, `editedContent`) — saf kod, her `edited` event'te hesaplanıp saklanır. **Kuzey yıldızı: seri/hesap bazında median edit-distance DÜŞER.**
- **Acceptance rate:** approved / (approved+rejected).
- **Feedback tipleri** mevcut chip seti korunur (not_my_tone/hook_weak/too_ai/…) — pattern extractor'ın etiket kaynağı.

## 4. Öğrenme döngüsü + false-learning savunması

```
Taslak → Offline eval (14 alt-skor) → İnsan inceleme (FeedbackEvent + edit-distance)
→ MANUEL yayın (PublishLog) → PerformanceSnapshot (planlı) → Normalize performans
   (z-score vs CreatorBaseline · time-decay · cold-start tabanı: min örnek/impression)
→ Pattern extraction (aday ders → ViralPattern status=candidate)
→ İKİ-KAPILI DOĞRULAMA:
   (a) repetition: supportCount ≥ N (başlangıç N=3)
   (b) significance: normalize-lift CI 0'ı dışlar (bootstrap/Mann-Whitney)
   (c) MARKA VETOSU: engagement artıran ama edit-distance/ret/ses-drift artıran ders REDDEDİLİR
→ Memory update (FINAL-MEMORY-SPEC proposed→approve akışı) → grounding.ts'e geri besler
```

Tek şanslı post asla kural olamaz (unit test: tek outlier → promotion YOK). Council birleşimi (C7, V1): hook/persona/risk/novelty lensleri → alt-skor #8/#5/#12-veto/#6; `council-config.ts` ağırlıkları rubrik ağırlığı olur; tek judge sözlüğü.

## 5. Kalibrasyon (V1, haftalık — 18:00 cron slotu)

- İnsan-etiketli örneklemde alt-skor başına **Cohen's κ ≥ 0.6** (veya TPR≥0.8 & TNR≥0.8). Altında kalan alt-skor UI'da "düşük güven" etiketi alır + kompozitten çıkarılır.
- Judge model + prompt version her skorla saklanır (model swap atfedilebilir).
- Position-swap testi: sıra değişince verdikt toleransta sabit.

## 6. Golden set & regression

- `EvalTest` + `eval:run` mevcut altyapı BÜYÜTÜLÜR: hesap başına 50-100 vaka (≥15 edge; seri başına 10-30), `METRIC_MAP` yeni alt-skor adlarına genişler.
- **CI kuralı:** prompt/model/retrieval değişikliği `eval:run --all` yeşilse merge olur; `PASS:` satırının altına düşen vaka bloklar.
- Set bölümlenir; dönen holdout dilimi judge'ın ezber değil genelleme yaptığını doğrular. Bilinen-kötü kontrast örnekleri (AI-slop, off-persona, uydurma sayı) düşük skorlamak ZORUNDA.

## 7. KPI'lar (yeni ekran YOK — C9: CostsTab detay + readiness tik sinyal)

Acceptance rate · median edit-distance (seri bazında) · judge-insan κ · golden pass % · candidate-vs-validated ders sayısı · cost-per-accepted-draft. Dört durum tasarımı (error ≠ empty).

## 8. Faz yerleşimi

- **MVP:** motor birleştirmeyle gelen ayrışık alt-sinyaller (03-Low seti) + edit-distance + `eval:run` CI gate + writer≠judge registry testi. (Tam 14'lü set DEĞİL.)
- **V1:** tam 14 alt-skor + batched karşı-aile judge + council birleşimi + performans atıfı + kalibrasyon cron + KPI'lar.
- **V2:** pairwise operatör A/B + Bradley-Terry + bandit varyant seçimi (yalnız iki-kapı en az bir kötü dersi kanıtlanabilir engelledikten sonra).

## 9. Kabul kriterleri

- [ ] Deterministik alt-skorlar unit-testli (sınır durumları dahil).
- [ ] Judge tek batched çağrı; Zod-validated; 1 repair retry; `generateJsonGated` + `judge_` purpose.
- [ ] Registry testi: aktif profile'da writer ailesi ≠ judge ailesi.
- [ ] UI: hiçbir yol parçaları olmadan yalnız viral sayısı render etmez (test).
- [ ] Tek-outlier-promotion-yok testi + sentetik clickbait marka-vetosu testi yeşil.
- [ ] Her `edited` FeedbackEvent'te edit-distance hesaplanmış.
- [ ] κ tabanı altındaki alt-skor "düşük güven" + kompozit dışı.
- [ ] Golden set ≥50 vaka; `eval:run --all` CI'da; holdout genelleme doğrulanır.
- [ ] KPI'lar CostsTab'de, 4 durum tasarımlı; yeni ekran yok.
