import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma is generated to a custom output dir (src/generated/prisma). Next's
  // serverless file tracing does not pick up the native ".so.node" query-engine
  // binary there, so force-include the whole generated client in every function
  // bundle. Fixes "Query Engine not found / not copied to deployment folder" on
  // Vercel/AWS Lambda.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**"],
  },
  // Dev overlay "N" göstergesi sol-alt köşede sidebar'ın daralt/hesap
  // kontrollerinin ÜZERİNE biner ve tıklamayı yutar (e2e + gerçek kullanım).
  // Prod'u etkilemez — yalnız dev chrome'u kapatır.
  devIndicators: false,
};

export default nextConfig;
