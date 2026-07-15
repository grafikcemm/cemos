"use client";

import HostPlaceholder from "./HostPlaceholder";

/**
 * Faz 1B yeni-ev iskele ekranları. nav/store/shell bunlara bağlanır; tam
 * kompozisyon Faz 1D'de (05-SCREEN-BY-SCREEN-SPEC). Her biri dürüst placeholder.
 */

export function PlanTakvimHost() {
  return (
    <HostPlaceholder
      eyebrow="Plan"
      title="Takvim"
      subtitle="Aylık yayın yerleşimi ve seçilen fırsattan üretilen reels senaryosu."
      comingContent="Burada aylık yayın takvimi ve seçilen fırsattan üretilmiş reels dossier'i yaşayacak."
    />
  );
}

export function PlanFirsatlarHost() {
  return (
    <HostPlaceholder
      eyebrow="Plan"
      title="Fırsatlar"
      subtitle="Editoryal seçilmiş içerik fırsatları — rakip, trend, haber ve sektör sinyalleri."
      comingContent="Burada rakip radarı, haber buzz'ı, YouTube fırsatları ve ham araştırmaya inen detay bağlantıları yaşayacak."
    />
  );
}

export function PlanSerilerHost() {
  return (
    <HostPlaceholder
      eyebrow="Plan"
      title="Seriler"
      subtitle="Carousel ve Reels seri DNA'sı — görsel düzen, caption ve hook kalıpları."
      comingContent="Burada seri DNA editörü, caption/hashtag yapısı ve seri performansı yaşayacak."
    />
  );
}

export function LibTumuHost() {
  return (
    <HostPlaceholder
      eyebrow="Kütüphane"
      title="Tümü"
      subtitle="Viral örnekler, prompt, pattern ve anahtar kelime kaynaklarında birleşik arama."
      comingContent="Burada dört kütüphanenin (viral, prompt, pattern, anahtar kelime) birleşik aramalı yüzeyi yaşayacak."
    />
  );
}

export function LibIlhamHost() {
  return (
    <HostPlaceholder
      eyebrow="Kütüphane"
      title="İlham"
      subtitle="Panolar ve rakip içerik analizi."
      comingContent="Burada koleksiyon panoları ve rakip içeriklerinin yapısal analizi yaşayacak."
    />
  );
}

export function LibOgrenmeHost() {
  return (
    <HostPlaceholder
      eyebrow="Kütüphane"
      title="Öğrenme"
      subtitle="Öğrenme içerikleri — Gelen kutusu, öğreniliyor, hazır ve bugünkü tekrar."
      comingContent="Burada YouTube/Obsidian öğrenme akışı (Gelen kutusu · Öğreniliyor · Hazır · Bugünkü tekrar) yaşayacak."
    />
  );
}

export function ProfileMemoryHost() {
  return (
    <HostPlaceholder
      eyebrow="Profil"
      title="CemOS'un bildikleri"
      subtitle="Kalıcı hafıza — ses anayasası, seri DNA'sı ve öğrenilen kurallar."
      comingContent="Burada hafıza önerileri, aktif kurallar ve kural ekleme yüzeyi yaşayacak."
    />
  );
}

export function ProfileIntegrationsHost() {
  return (
    <HostPlaceholder
      eyebrow="Profil"
      title="Entegrasyonlar"
      subtitle="Kimlik bilgileri, izinler ve dış bağlantı sağlığı."
      comingContent="Burada X, Meta, OpenRouter ve diğer sağlayıcıların bağlantı durumu ve env kurulum ipuçları yaşayacak."
    />
  );
}
