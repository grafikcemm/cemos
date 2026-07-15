"use client";

import HostPlaceholder from "./HostPlaceholder";

/**
 * Faz 1B yeni-ev iskele ekranları. nav/store/shell bunlara bağlanır; tam
 * kompozisyon Faz 1D'de (05-SCREEN-BY-SCREEN-SPEC). Her biri dürüst placeholder.
 * Plan/Kütüphane host'ları `bare` — başlığı shell (AppShell WorkspaceHeader)
 * sağlar (referans sıra: hero başlık → segmented subnav → gövde). Profil
 * host'ları kendi başlığını taşır (shell başlık sağlamaz).
 */

export function LibTumuHost() {
  return (
    <HostPlaceholder
      bare
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
      bare
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
      bare
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
