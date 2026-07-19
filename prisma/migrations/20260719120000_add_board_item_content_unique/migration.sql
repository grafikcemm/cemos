-- Phase 4B (ADR-041) — additive: enforce "one canonical content per board".
-- PostgreSQL treats NULLs as distinct in a unique index, so free board items
-- (contentItemId IS NULL: url / note / image) are unaffected; only a duplicate
-- (boardId, contentItemId) pair with a real contentItemId is rejected.
-- Read-only verified before apply: 0 BoardItem rows, 0 duplicate groups.
-- Non-destructive, no data change; empty table so index build is instant.
CREATE UNIQUE INDEX "BoardItem_boardId_contentItemId_key"
  ON "BoardItem"("boardId", "contentItemId");
