# CemOS

Kişisel üretim motoru — içerik, haber ve sistem otomasyonu. Eski adı **GrafikCem XAgent**; vizyon ve isimlendirme sözleşmesi için [docs/CEMOS.md](docs/CEMOS.md).

OpenRouter tabanli, 2 hesapli (grafikcem + maskulenkod) kisisel X icerik sistemi.

## Model stratejisi

- Ana uretici: `deepseek/deepseek-v4-flash`
- Kalite/risk denetcisi: `deepseek/deepseek-v4-pro`
- Premium yedek: varsayilan kapali

Kalite pipeline'i tek modelle "tweet yaz" yapmaz. Flash kaynak ozetler ve taslak uretir; Pro final secim ve risk denetimi yapar.

## Rakip/kaynak verisi

`src/data/competitors.json` dosyasinda her hesap icin 32 rakip ve kaynak hesap bulunur. Bu veri:

- benchmark promptlarina rakip/kaynak baglami olarak eklenir,
- panelde hesap bazli kaynak kartlari olarak gosterilir,
- ileride X API tarama butcesi icin source library temelini olusturur.

## Kurulum

```bash
npm install
copy env.sample .env.local
npm run dev
```

`OPENROUTER_API_KEY` bos kalirsa benchmark ekrani mock sonuc dondurur. Anahtar eklenince gercek OpenRouter cagrilari yapilir.

## Geliştirme

```bash
npm run lint
npm run build
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
