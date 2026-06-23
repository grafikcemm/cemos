# CemOS Audit Remediation — 2026-06-23

Remediation of the findings in the Codex audit (`docs/codex-audit-prompt.md` run output).
Plan: `~/.claude/plans/docs-codex-audit-prompt-md-dosyas-n-n-te-unified-candle.md`.

| ID | Severity | Status | What changed |
| --- | --- | --- | --- |
| SEC-01 | HIGH | FIXED | `POST /api/content` now calls `isOperatorOrCronAuthorized` (403 plain, 200/201 same-origin). SSRF-safe no-fetch preserved. |
| SEC-02 | MEDIUM | DOCUMENTED | Access boundary = Vercel Deployment Protection; written up in `docs/CEMOS.md §7`. No middleware (single-operator invariant kept). |
| SEC-03 | MEDIUM | FIXED | `IntegrationCredential.value` encrypted at rest via `src/lib/utils/secretCrypto.ts` (AES-256-GCM, `CREDENTIAL_ENC_KEY`). Legacy plaintext decrypts transparently, re-encrypts on next upsert. |
| SEC-04 | MEDIUM | FIXED | `src/lib/ai/generateGated.ts` centralizes `assertGenerationAllowed()` + `recordOpenRouter()`. Migrated `reverseEngineer`, `aiRankingsService`, `qualityLintService`. AI routes return 402 `{code:"budget"}` on `BudgetExceededError`. |
| SEC-05 | LOW | FIXED | `POST /api/mcp` now guarded with `isOperatorOrCronAuthorized`; GET catalog stays open. |
| SEC-06 | LOW | FIXED | `src/lib/utils/url.ts#safeExternalHref` allowlists http/https/mailto. Applied in `ToolboxToolCard`, `TweetCard`, `LibraryTab`; `LibraryTab` rel fixed to `noopener noreferrer`. |
| API-01 | MEDIUM | FIXED | `parseJsonBody` (`src/lib/utils/apiResponse.ts`) → malformed JSON now returns 400, not 500. Applied across all mutation routes. |
| API-02 | MEDIUM | FIXED | Zod `safeParse` added at every JSON boundary missing it (growth/*, instagram/*, youtube/*, learn/*, settings/*, queue/*, news, scan, generate). |
| API-03 | LOW | FIXED | `ok()`/`fail()` envelope helpers applied repo-wide. Documented non-envelope exception: `GET /api/health` (+ a few raw read returns intentionally preserved). |
| FE-01 | MEDIUM | FIXED | Mobile breakpoint (`@media max-width:640px`) in `globals.css`: hides desktop sidebar, shows existing off-canvas drawer + hamburger, shrinks `--space-page-x` to 16px. |
| OPS-01 | MEDIUM | FIXED | `scripts/ci-demo.ts` first DB call wrapped in `withColdStartRetry` (backoff for Neon P2024 cold-start). Pool timeouts were already tuned in `src/lib/db/client.ts`. |
| DEP-01 | LOW | PARTIAL | `npm audit fix` cleared 2 of 5. Remaining 3 (postcss/esbuild via Next 16.2.6) need a breaking Next downgrade — accepted risk, transitive/dev-only, no high/critical. Revisit on Next upgrade. |
| CONF-01 | LOW | FIXED | `prisma`/`@prisma/client` pinned to exact `6.19.3` (was `^6.8.2`, installed drifted to 6.19.3). `.env.example` already complete; added `CREDENTIAL_ENC_KEY`. |
| TEST-01 | LOW | FIXED | Added tests: `secretCrypto`, `safeExternalHref`, `generateJsonGated` (budget gate + single usage log), `reverseEngineer` (prompt-injection / draft-stays-new), `apiResponse.parseJsonBody`, `POST /api/content` guard regression. |

## Notes / accepted risk
- DEP-01: `next@16.2.6` pins a vulnerable transitive `postcss`/`esbuild`; the only `npm audit fix --force` path downgrades Next to 9.3.3 (breaking). Tracked, not applied.
- A few endpoints that previously tolerated empty/malformed POST bodies (`youtube/discover`, growth `send-to-queue`) now require valid JSON (send `{}`), per the API-01 intent.
