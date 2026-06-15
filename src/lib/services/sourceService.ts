import { accountRepo } from "@/lib/db/accountRepo";
import { sourceRepo } from "@/lib/db/sourceRepo";
import type { Source } from "@/generated/prisma/client";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export type AddSourceInput = {
  accountHandle: string;
  handle: string;
  displayName?: string;
  mode?: string;
  thresholdLikes?: number;
  thresholdRetweets?: number;
};

export type UpdateSourceInput = {
  displayName?: string;
  enabled?: boolean;
  mode?: string;
  thresholdLikes?: number;
  thresholdRetweets?: number;
};

export class SourceServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
  }
}

export const sourceService = {
  async listSources(accountHandle: string): Promise<Source[]> {
    const account = await accountRepo.findByHandle(accountHandle);
    if (!account) throw new SourceServiceError("Account not found", "ACCOUNT_NOT_FOUND");
    return sourceRepo.listByAccount(account.id);
  },

  async addSource(input: AddSourceInput): Promise<Source> {
    if (!HANDLE_RE.test(input.handle)) {
      throw new SourceServiceError(
        "Geçersiz handle: 1–15 karakter, sadece harf/rakam/alt çizgi",
        "INVALID_HANDLE"
      );
    }

    const account = await accountRepo.findByHandle(input.accountHandle);
    if (!account) throw new SourceServiceError("Account not found", "ACCOUNT_NOT_FOUND");

    const ownHandle = account.xHandle.replace("@", "").toLowerCase();
    if (input.handle.toLowerCase() === ownHandle) {
      throw new SourceServiceError("Kendi hesabını kaynak olarak ekleyemezsin", "SELF_SOURCE");
    }

    const existing = await sourceRepo.findByAccountAndHandle(account.id, input.handle);
    if (existing) {
      throw new SourceServiceError("Bu kaynak zaten ekli", "DUPLICATE_SOURCE");
    }

    return sourceRepo.create({
      accountId: account.id,
      handle: input.handle,
      displayName: input.displayName,
      mode: input.mode ?? "TWEET",
      thresholdLikes: input.thresholdLikes ?? 10,
      thresholdRetweets: input.thresholdRetweets ?? 2,
    });
  },

  async updateSource(id: string, data: UpdateSourceInput): Promise<Source> {
    const source = await sourceRepo.findById(id);
    if (!source) throw new SourceServiceError("Source not found", "NOT_FOUND");
    return sourceRepo.update(id, data);
  },

  async archiveSource(id: string): Promise<Source> {
    const source = await sourceRepo.findById(id);
    if (!source) throw new SourceServiceError("Source not found", "NOT_FOUND");
    return sourceRepo.archive(id);
  },
};
