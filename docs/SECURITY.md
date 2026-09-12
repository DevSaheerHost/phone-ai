# Security Review

This document records the security review performed on this codebase
before considering it ready for a first production deployment. It follows
the categories in the review checklist used to build this system.

## Follow-up review — critical finding and fix

A second, deeper review (focused on the end-to-end call flow, RLS, and the
OpenAI Realtime protocol) found one **critical** issue that the initial
review missed:

**`admin_roles` had no Row Level Security policy at all.** Every other
table's authorization depends on `is_admin()`, which checks membership in
`admin_roles` — but the table gating that check was never itself locked
down. In a live Supabase project this would have let any signed-up,
non-admin user read the full admin roster and, more seriously, **insert a
row granting themselves admin access**, bypassing every other control in
this document. Verified against a real local Postgres instance (not just
inspection): before the fix, a non-admin `authenticated` role could select
and insert into `admin_roles` freely; after adding
`alter table admin_roles enable row level security;` plus an admin-only
`select` policy (deliberately no insert/update/delete policy — rows are
provisioned only via the service-role key), the same session was blocked
from reading the table, from self-granting admin, and consequently from
reading any RLS-protected business table too, while a genuine admin
retained full access. Fixed in `supabase/migrations/0001_init.sql`.

This has not been applied to any live Supabase project (per the earlier
decision to ship migration files only, not provision a live database), so
no real deployment was ever exposed — but this must be re-verified after
`supabase db push` against your actual project before granting anyone
dashboard access.

### Other correctness/reliability fixes from the same review

Not security vulnerabilities in the traditional sense, but bugs that would
have broken the core product on a real call:

- **Every AI tool call would have failed.** The OpenAI Realtime API
  rejects `response.create` while a response is still active, but the code
  was calling it immediately after `response.function_call_arguments.done`
  — which fires _before_ that response's own `response.done`. Every
  pricing lookup, repair-status check, booking, and transfer would have
  hit this. Fixed by buffering function calls until `response.done`
  confirms the response has actually ended (`openaiRealtimeClient.ts`).
- **An OpenAI outage mid-call silently dropped the caller** instead of
  transferring to a human, which the spec requires for backend failures.
  Fixed in `mediaBridge.ts`.
- **Pricing/availability lookups used exact string matching**, so any
  spelling variation between the AI's transcribed model name and the
  shop's stored value (e.g. "A15" vs "Samsung Galaxy A15") would report
  "no price on file" for a real, configured device. Fixed with a sanitized
  substring match (`likeContains` in `validation.ts`) — still never
  fabricates a price, just finds real rows more reliably.
- **The booking/service-request idempotency key was never actually
  populated** — it was optional and nothing ever supplied it, so the
  protection existed in schema only. Fixed by having the voice-service
  stamp the Realtime API's own function-call id as the key before
  execution (`toolExecutor.ts`).
- **`response.cancel`/`response.create` were sent unconditionally**,
  causing a guaranteed API error on almost every normal caller turn (not
  just real barge-in). Fixed by tracking response-active state and no-op'ing
  both calls when there's nothing to cancel/nothing to interrupt.

## Findings and mitigations

| Area                                  | Finding                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposed secrets                       | N/A                          | No secrets are hard-coded anywhere; all read from environment variables validated by `packages/shared/src/env.ts`. `.env`/`.env.local` are git-ignored.                                                                                                                                                                                                                                                                                        |
| Client-side service keys              | N/A                          | `SUPABASE_SERVICE_ROLE_KEY` exists only in `apps/voice-service`'s environment and is never referenced by `apps/web` or any browser-bundled code — verified by grep (`grep -r SERVICE_ROLE apps/web` returns nothing).                                                                                                                                                                                                                          |
| Unrestricted database access          | N/A                          | The AI model never gets a database handle — only the nine functions in `packages/shared/src/tools/registry.ts`, each validated with zod. The admin dashboard queries as the signed-in user; RLS (`is_admin()`) is the actual authorization boundary, not application code.                                                                                                                                                                     |
| Arbitrary SQL                         | N/A                          | No raw SQL string concatenation anywhere; all access goes through the Supabase JS client's parameterized query builder.                                                                                                                                                                                                                                                                                                                        |
| Unauthenticated admin endpoints       | N/A                          | Every `/admin/*` route is gated by `proxy.ts` (session presence) and `app/admin/layout.tsx` (`admin_roles` membership), enforced again by RLS regardless of application-layer bugs.                                                                                                                                                                                                                                                            |
| Unverified webhooks                   | **Fixed during development** | Both `/twilio/voice` and `/twilio/status` verify `X-Twilio-Signature` via `twilio.validateRequest` before any handler logic runs (`apps/voice-service/src/security/twilioSignature.ts`), rejecting missing/invalid signatures and non-POST methods.                                                                                                                                                                                            |
| Prompt injection                      | Addressed by design          | The system prompt (`packages/shared/src/systemPrompt.ts`) explicitly instructs the model to treat caller speech as data, never as new instructions, and never to reveal its instructions/internal details. This is defense-in-depth, not the primary control — the primary control is that the model cannot take any action outside the nine validated tools regardless of what it's told to do.                                               |
| Unsafe tool parameters                | N/A                          | Every tool input is validated with a zod schema before touching the database (see `packages/shared/src/tools/*.ts`); malformed or unparseable AI-generated arguments are rejected with a safe error, never passed through.                                                                                                                                                                                                                     |
| Missing rate limits                   | **Mitigated**                | `/twilio/*` routes are rate-limited per IP (`express-rate-limit`) as defense-in-depth on top of signature verification. Supabase Auth applies its own rate limiting to sign-in attempts.                                                                                                                                                                                                                                                       |
| PII leakage                           | Mitigated                    | Call records store metadata only (no audio by default). Transcript text is used transiently for language detection and discarded unless `ENABLE_TRANSCRIPT_STORAGE=true`. The structured logger (`packages/shared/src/logger.ts`) redacts any field whose key matches `key\|token\|secret\|password\|authorization`, and phone numbers are masked (`maskPhoneNumber`) in log lines.                                                            |
| Insecure logs                         | N/A                          | All logs are structured JSON with the redaction above; no raw request bodies or credentials are logged.                                                                                                                                                                                                                                                                                                                                        |
| SSRF                                  | N/A                          | No endpoint fetches a user/caller-controlled URL. Twilio API calls (`transferLiveCall`, `hangupLiveCall`) use a fixed, config-sourced destination (`HUMAN_TRANSFER_NUMBER`) and a server-verified `callSid`, never caller input.                                                                                                                                                                                                               |
| Command injection                     | N/A                          | No shell execution of any user/caller-controlled input anywhere in the codebase.                                                                                                                                                                                                                                                                                                                                                               |
| XSS                                   | N/A                          | The dashboard is a React/Next.js app; all dynamic content is rendered through JSX (auto-escaped). No `dangerouslySetInnerHTML` is used.                                                                                                                                                                                                                                                                                                        |
| CSRF                                  | N/A                          | Next.js Server Actions include built-in same-origin verification; there are no state-changing GET endpoints.                                                                                                                                                                                                                                                                                                                                   |
| Dependency vulnerabilities            | **Fixed during development** | `npm audit` initially reported vulnerable transitive versions of Next.js, Express (via `qs`), and `uuid`. Resolved by upgrading to Next.js 16.3.5, Express 5.2.1, `uuid@11`, and pinning `qs` to a patched version via an npm `overrides` entry. `npm audit` reports **0 vulnerabilities** as of this review.                                                                                                                                  |
| Webhook replay / duplicate processing | **Fixed during development** | `/twilio/status` is deduplicated via the `webhook_events` table (unique `(provider, provider_event_id)`). `/twilio/voice` retries are deduplicated via a unique constraint on `calls.provider_call_id` — `startCallRecord` returns the original call's id on a conflict instead of minting a duplicate call record. `bookings`/`service_requests` accept an optional `idempotency_key` so a retried AI tool call can't double-create a record. |
| Media Stream endpoint hijacking       | Addressed by design          | The WebSocket URL handed to Twilio carries a short-lived (5 minute), HMAC-signed, Call-SID-bound token (`apps/voice-service/src/security/mediaStreamAuth.ts`), verified with a constant-time comparison (`crypto.timingSafeEqual`) at the HTTP Upgrade step, before any WebSocket connection is accepted.                                                                                                                                      |
| Least privilege                       | Addressed by design          | `apps/web` never holds the service-role key. `apps/voice-service` holds it, but the AI itself has no direct database access — only the validated tool registry. Supabase Auth + RLS is the authorization boundary for the dashboard, not `if` statements in route handlers.                                                                                                                                                                    |

## Things this review deliberately does not claim

- **Penetration testing**: this is a code-level review, not a black-box or
  authorized penetration test of a live deployment. Before going live,
  consider an independent security assessment appropriate to your risk
  tolerance.
- **Compliance certification**: this system does not claim GDPR/HIPAA/PCI
  or any other specific compliance certification. See the compliance note
  in the main [README](../README.md#compliance-note-call-recordingtranscription)
  regarding call recording/transcription consent, which is
  jurisdiction-specific and left to the deploying organization to configure
  correctly.
- **Twilio/OpenAI/Supabase platform security**: this review covers the code
  in this repository. The security of the underlying platforms (Twilio,
  OpenAI, Supabase, your hosting provider) is out of scope — follow each
  provider's own security best practices (e.g. rotating API keys,
  restricting Supabase project access, enabling 2FA on all provider
  accounts).

## Re-running the checks yourself

```bash
npm audit                          # dependency vulnerabilities
npm run lint --workspaces          # static analysis (unused vars, unsafe patterns, etc.)
npm run typecheck --workspaces     # type safety
npm run test --workspaces          # includes webhook-signature and tool-validation tests
grep -r "SERVICE_ROLE" apps/web    # should return nothing
```
