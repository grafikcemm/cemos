import { prisma } from "@/lib/db/client";
import type { IntegrationCredential } from "@/generated/prisma/client";

/**
 * DB-tabanlı kimlik deposu. Meta token'ı burada tutmak, Vercel env'in runtime'da
 * değişmezliğini aşar — yenilenen token redeploy'suz devreye girer (igClient
 * DB → env sırasıyla okur).
 */
export type UpsertCredentialExtra = {
  expiresAt?: Date | null;
  meta?: Record<string, unknown>;
};

export const integrationCredentialRepo = {
  get(key: string): Promise<IntegrationCredential | null> {
    return prisma.integrationCredential.findUnique({ where: { key } });
  },

  upsert(
    key: string,
    value: string,
    extra?: UpsertCredentialExtra
  ): Promise<IntegrationCredential> {
    const data = {
      value,
      ...(extra?.expiresAt !== undefined ? { expiresAt: extra.expiresAt } : {}),
      ...(extra?.meta !== undefined ? { meta: JSON.stringify(extra.meta) } : {}),
    };
    return prisma.integrationCredential.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  },
};
