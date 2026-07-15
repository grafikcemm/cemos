import { z } from "zod";

/**
 * Yapısal thread segment sözleşmesi (Faz 1C). QueueItem.threadSegments JSON
 * string olarak saklanır; sınırda Zod ile doğrulanır. Metindeki "1/" gibi
 * numaralandırma YAPISAL kanıt SAYILMAZ — readiness yalnız bu tipli veriye bakar.
 */
export const ThreadSegmentSchema = z.object({
  text: z.string(),
});

export const ThreadSegmentsSchema = z.array(ThreadSegmentSchema);

export type ThreadSegment = z.infer<typeof ThreadSegmentSchema>;

/** JSON string → doğrulanmış segment listesi; boş/geçersiz → null (fail-closed). */
export function parseThreadSegments(raw: string | null | undefined): ThreadSegment[] | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = ThreadSegmentsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.length === 0) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Segment listesi → doğrulanmış JSON string (persist için). */
export function serializeThreadSegments(segments: ThreadSegment[]): string {
  return JSON.stringify(ThreadSegmentsSchema.parse(segments));
}
