# AI Phone Receptionist — Mobile Sales & Repair Shop

A production-oriented AI phone receptionist: customers call the shop's real phone
number, talk to a real-time AI voice agent over a live audio stream (not
record → transcribe → reply → play back), and the AI answers with the shop's
actual approved pricing, repair status, and policy data — never invented
facts — collects information, creates bookings/service requests, and can
transfer the live call to a human technician.

## Contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Telephony (Twilio) setup](#telephony-twilio-setup)
- [OpenAI Realtime setup](#openai-realtime-setup)
- [Local development](#local-development)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Cost](#cost)
- [First test call procedure](#first-test-call-procedure)
- [Known limitations](#known-limitations)

## Architecture

```
Customer
  │  (PSTN call)
  ▼
Twilio phone number
  │  webhook: POST /twilio/voice   (signed, verified)
  ▼
apps/voice-service  (persistent Node.js process — NOT serverless)
  │  returns TwiML: <Connect><Stream url="wss://.../media-stream">
  │
  │  Twilio opens a bidirectional WebSocket (Media Streams) back here,
  │  streaming raw 8kHz μ-law audio frames in real time
  ▼
MediaBridge (apps/voice-service/src/realtime/mediaBridge.ts)
  │  forwards caller audio  ──────────────►  OpenAI Realtime API (WebSocket)
  │  forwards AI audio      ◄──────────────  speech-to-speech, server-side VAD
  │                                          (barge-in: caller speech cancels
  │                                           the AI's in-flight response)
  │
  │  AI tool calls (function calling) are the ONLY way the model touches
  │  business data:
  ▼
packages/shared/src/tools/registry.ts  (validated with zod, no raw SQL/DB access)
  │
  ▼
Supabase / PostgreSQL  (service-role key, RLS everywhere, used only server-side)
  │
  ▼
apps/web  — Next.js admin dashboard (staff sign in, RLS-scoped to admin_roles)
```

Two independent runtimes:

| Component            | Runtime                                                                                | Why                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/voice-service` | Persistent Node.js process (Docker/VM/Fly/Railway/ECS — **not** a serverless function) | Holds two long-lived WebSocket connections per call (Twilio Media Streams + OpenAI Realtime) for the call's entire duration. Serverless platforms kill connections after seconds/minutes and cannot hold a bidirectional stream. |
| `apps/web`           | Next.js on Vercel (or any Node host)                                                   | Stateless request/response admin dashboard — a normal web app, deploys fine to serverless.                                                                                                                                       |

`packages/shared` is a plain TypeScript library imported by both: business
tool implementations, validation schemas, the system prompt builder, and
types. Neither app talks to the database directly with raw SQL — every
write/read goes through a typed function in `packages/shared/src/tools/`.

### Why not "record → transcribe → HTTP → reply → play file"?

That architecture adds seconds of latency per turn, can't be interrupted
(no barge-in), and sounds like a chatbot reading a script. This system uses
OpenAI's Realtime API (speech-to-speech over WebSocket) bridged directly to
Twilio's Media Streams, so audio flows continuously in both directions with
server-side voice-activity detection driving natural turn-taking and
interruption handling.

## Repository layout

```
packages/shared/          Business tools, validation, system prompt, types — shared library
apps/voice-service/       Persistent Node service: Twilio webhooks, Media Streams,
                           OpenAI Realtime bridge, call logging, transfer/hangup
apps/web/                 Next.js admin dashboard (calls, bookings, service requests,
                           pricing, shop config) — Supabase Auth + RLS
supabase/migrations/      SQL schema (enums, tables, indexes, RLS policies)
supabase/seed.sql         Example seed data for local development
.env.example              Every environment variable, documented
```

## Environment variables

See [`.env.example`](./.env.example) for the full list with inline
descriptions. Summary:

| Variable                                                     | Used by            | Notes                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                             | voice-service      | Server-only. Never in browser code.                                                                                                                     |
| `OPENAI_MODEL`                                               | voice-service      | A Realtime (speech-to-speech) model, e.g. `gpt-realtime`.                                                                                               |
| `TELEPHONY_ACCOUNT_ID`                                       | voice-service      | Twilio Account SID.                                                                                                                                     |
| `TELEPHONY_AUTH_TOKEN`                                       | voice-service      | Twilio Auth Token — also signs/verifies webhooks.                                                                                                       |
| `TELEPHONY_PHONE_NUMBER`                                     | voice-service      | The shop's Twilio number (E.164).                                                                                                                       |
| `HUMAN_TRANSFER_NUMBER`                                      | voice-service      | Where live calls are transferred (E.164).                                                                                                               |
| `SUPABASE_URL`                                               | voice-service      | Project URL.                                                                                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | voice-service only | Full DB access, bypasses RLS. **Never** in apps/web or any browser code.                                                                                |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | apps/web           | Browser-safe; RLS (`admin_roles`) is the real authorization boundary.                                                                                   |
| `PUBLIC_BASE_URL`                                            | voice-service      | Public HTTPS URL of voice-service, used to build webhook/WS URLs and to verify Twilio signatures. Must exactly match what Twilio is configured to call. |
| `VOICE_WEBHOOK_SECRET`                                       | voice-service      | Signs the short-lived Media Stream auth token (`openssl rand -hex 32`).                                                                                 |
| `CALL_RECORD_RETENTION_DAYS`, `ENABLE_TRANSCRIPT_STORAGE`    | voice-service      | Compliance/retention knobs — see [Security](#security).                                                                                                 |

## Database

All schema lives in `supabase/migrations/0001_init.sql`: enums, tables
(`shop_config`, `device_pricing`, `part_availability`, `customers`,
`repair_tickets`, `bookings`, `service_requests`, `calls`, `call_events`,
`webhook_events`, `admin_roles`), indexes, constraints, and Row Level
Security policies gated by an `is_admin()` helper.

Apply migrations to a Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or, for local development with the Supabase CLI's local stack:

```bash
supabase start
supabase db reset   # applies migrations, then supabase/seed.sql
```

**RLS design**: every table has RLS enabled. `apps/voice-service` uses the
service-role key, which bypasses RLS by design (it is the trusted backend).
`apps/web` always queries as the signed-in user — RLS's `is_admin()` check
(via the `admin_roles` table) is what actually authorizes every dashboard
read/write, not application code.

**Granting dashboard access to a staff member**:

```sql
-- After the person signs up once through Supabase Auth (e.g. via the
-- dashboard's own sign-up, or created in the Supabase Auth admin UI):
insert into admin_roles (user_id, role)
values ('<their-auth-user-uuid>', 'admin');
```

## Telephony (Twilio) setup

This system targets **Twilio Programmable Voice**. To go live:

1. Buy/port a phone number in the Twilio Console with Voice capability.
2. Set the number's **"A call comes in"** webhook to
   `POST https://<PUBLIC_BASE_URL>/twilio/voice`.
3. Set **"Call status changes"** to
   `POST https://<PUBLIC_BASE_URL>/twilio/status`.
4. Copy the Account SID → `TELEPHONY_ACCOUNT_ID`, Auth Token →
   `TELEPHONY_AUTH_TOKEN`, the number itself → `TELEPHONY_PHONE_NUMBER`.
5. Set `HUMAN_TRANSFER_NUMBER` to the technician line calls should transfer to.

`PUBLIC_BASE_URL` **must** exactly match the host Twilio calls (scheme +
host, no trailing slash) — it's part of the signature Twilio computes, so a
mismatch makes every webhook fail signature verification (by design; see
[Security](#security)).

## OpenAI Realtime setup

1. Create an API key with access to a Realtime (speech-to-speech) model.
2. Set `OPENAI_API_KEY` and `OPENAI_MODEL` (e.g. `gpt-realtime`).
3. No further configuration — the session (voice, audio format, tools,
   turn detection, transcription-for-language-detection) is configured
   programmatically in `apps/voice-service/src/realtime/openaiRealtimeClient.ts`
   from the shop's config record on every call.

## Local development

Prerequisites: Node.js ≥ 20, npm, a Supabase project (or the Supabase CLI
for a local stack), a Twilio account, an OpenAI API key, and a tunnel tool
(e.g. `ngrok`, `cloudflared`) since Twilio must reach your machine over
HTTPS/WSS.

```bash
npm install

# Apply the schema (see Database section) and seed example data
supabase db push   # or: supabase db reset (local stack)

# Terminal 1 — voice service
cp .env.example apps/voice-service/.env   # fill in real values
npm run dev:voice

# Terminal 2 — expose it publicly for Twilio
ngrok http 8080
# copy the https URL into PUBLIC_BASE_URL, restart dev:voice,
# and point the Twilio number's webhooks at it (see above)

# Terminal 3 — admin dashboard
cp .env.example apps/web/.env.local        # only needs the NEXT_PUBLIC_* vars
npm run dev:web
```

Useful commands (run from the repo root, apply to all workspaces):

```bash
npm run build       # compiles packages/shared, apps/voice-service; builds apps/web
npm run typecheck
npm run lint
npm run test         # unit + integration tests (mocked external services)
npm run format       # prettier --write
```

## Production deployment

**Environments**: keep separate Supabase projects, Twilio numbers, and
`.env` files for development / staging / production. Never point a staging
voice-service at the production Supabase project or Twilio number.

1. **Database**: create/select a Supabase project, run
   `supabase db push` against it, grant `admin_roles` to real staff accounts.
2. **Voice service**: build the Docker image
   (`apps/voice-service/Dockerfile`) and deploy it to a host that keeps a
   persistent process and long-lived WebSocket connections — e.g. Fly.io,
   Railway, Render (background worker/web service, not "functions"), or a
   plain VM/ECS task behind a load balancer with WebSocket support and no
   aggressive idle timeout. Expose it over HTTPS/WSS at your
   `PUBLIC_BASE_URL`.
3. **Web dashboard**: deploy `apps/web` to Vercel (or any Node host)
   with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set.
4. **Twilio**: point the production number's webhooks at the deployed
   voice-service's `PUBLIC_BASE_URL` (see [Telephony setup](#telephony-twilio-setup)).
5. **Health checks**: point your platform's health check at `GET /health`
   (liveness) and `GET /ready` (readiness — verifies DB connectivity)
   on the voice-service; `apps/web` exposes the same two routes.
6. **Rollback**: redeploy the previous voice-service image/tag; Twilio
   webhook URLs don't need to change. Database migrations in this project
   are additive-only by design — if you write a destructive migration,
   ensure it has a tested down-path before applying it to production.

## Troubleshooting

| Symptom                                         | Likely cause                                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilio webhook returns 403                      | `PUBLIC_BASE_URL` doesn't exactly match the URL Twilio is calling, or `TELEPHONY_AUTH_TOKEN` is wrong.                                                                           |
| Call connects but there's silence               | Media Stream WebSocket never reached `/media-stream`, or the OpenAI Realtime connection failed — check voice-service logs for `openai_realtime_socket_error` / `realtime_error`. |
| AI gives a generic apology instead of an answer | A tool call failed or returned no data — check `tool_call_result` log events and the `errorCode`; this is deliberate (see [Conversation safety](#security)), not a bug.          |
| `/ready` returns 503                            | Supabase is unreachable — check `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and project status.                                                                                 |
| Booking/service request created twice           | Should not happen — both are idempotency-keyed; if it does, check whether the AI is retrying tool calls with a new key each time (a prompt/model issue) rather than reusing one. |
| Dashboard shows "not authorized" after login    | The signed-in user has no row in `admin_roles` — insert one (see [Database](#database)).                                                                                         |

## Security

Summary of the protections in this repository — see also
[`docs/SECURITY.md`](./docs/SECURITY.md) for the full review.

- **Webhook signature verification**: every Twilio webhook is verified with
  `twilio.validateRequest` against `TELEPHONY_AUTH_TOKEN`; missing/invalid
  signatures and non-POST methods are rejected before any handler logic runs.
- **Media Stream auth**: the WebSocket URL handed to Twilio carries a
  short-lived HMAC-signed token (5 min TTL, bound to the specific Call SID),
  preventing anyone who discovers the endpoint from opening arbitrary
  sessions against your OpenAI credentials.
- **No raw SQL/DB access for the model**: the AI can only call the nine
  tools in `packages/shared/src/tools/registry.ts`, each validated with zod
  before touching the database.
- **RLS everywhere**: every table enforces Row Level Security; the
  service-role key (full access) is confined to `apps/voice-service` and
  never reaches `apps/web` or any browser bundle.
- **Least privilege in the dashboard**: `apps/web` always queries as the
  signed-in user; `admin_roles` + RLS is the actual authorization boundary,
  not application-level `if` checks.
- **Prompt-injection resistance**: the system prompt explicitly instructs
  the model to treat caller speech as data, never as new instructions, and
  never to reveal its instructions or internal implementation details.
- **Rate limiting**: webhook routes are rate-limited per IP as
  defense-in-depth on top of signature verification.
- **PII minimization**: call records store metadata only, no audio, by
  default. Caller transcripts are used transiently for language detection
  and discarded unless `ENABLE_TRANSCRIPT_STORAGE=true`. Phone numbers are
  masked in logs (`maskPhoneNumber`).
- **Idempotency**: webhook processing (`webhook_events`) and booking/service
  request creation (`idempotency_key`) are idempotent, so retries never
  double-create records.
- **Safe failure**: every external call (OpenAI, Twilio, Supabase) is
  wrapped so failures produce a natural spoken fallback in the caller's
  language, never a raw error or a fabricated success claim.

### Compliance note (call recording/transcription)

This system does **not** record or persist call audio, and transcript text
is discarded by default (`ENABLE_TRANSCRIPT_STORAGE=false`). If you enable
transcript storage, or add audio recording, you are responsible for
determining and implementing whatever call-recording consent/disclosure
your jurisdiction requires (this varies widely and this repository does not
assume any particular jurisdiction's rules). Add an appropriate spoken
disclosure to the system prompt/greeting before doing so.

## Cost

This system uses metered third-party services. Approximate cost drivers
(check each provider's own pricing page for current rates — figures below
are intentionally not restated here since they change):

- **OpenAI Realtime API** — billed per minute of audio in/out plus tokens
  for tool-calling text; this is typically the largest per-call cost. See
  https://openai.com/api/pricing/
- **Twilio Programmable Voice** — per-minute inbound/outbound call charges,
  plus Media Streams, plus the monthly cost of the phone number itself. See
  https://www.twilio.com/en-us/voice/pricing
- **Supabase** — database storage/compute; the free tier is likely
  sufficient for a single shop's call/booking volume, low cost otherwise.
  See https://supabase.com/pricing
- **Voice-service hosting** — a small always-on instance (Fly.io/Railway/a
  VM) since it must be a persistent process, not pay-per-invocation
  serverless.
- **Vercel** — hosting the admin dashboard; typically free/low tier for
  this traffic level. See https://vercel.com/pricing

## First test call procedure

1. Confirm `npm run build && npm run test` pass (see [Local development](#local-development)).
2. Confirm `GET https://<PUBLIC_BASE_URL>/health` returns `{"status":"ok"}`
   and `GET /ready` returns `{"status":"ready"}`.
3. In the Supabase dashboard/SQL editor, confirm `shop_config` has one row
   (id=1) with real values (or use `supabase/seed.sql` for a test run).
4. Confirm the Twilio number's webhooks point at your `PUBLIC_BASE_URL`
   (see [Telephony setup](#telephony-twilio-setup)).
5. Call the Twilio number from a real phone.
6. You should hear the configured greeting within ~1-2 seconds.
7. Ask a question your `device_pricing`/seed data can answer (e.g. "how
   much for a Samsung A15 screen?") — confirm the AI quotes the exact
   seeded price, not a guess.
8. Ask something the data can't answer — confirm the AI says so and offers
   a human transfer, and that saying "yes" actually moves the call (you'll
   hear ringing on `HUMAN_TRANSFER_NUMBER`), not just a phone number read aloud.
9. Check the `calls` table (or `/admin/calls` in the dashboard) — confirm a
   row exists with the right outcome, duration, and (if applicable)
   `transferred_to_human = true`.

## Known limitations

- Language detection (`calls.language_detected`) is a coarse heuristic
  (Unicode-block based over the transcript), not a verified classification.
- Malayalam speech recognition/synthesis quality depends entirely on the
  underlying OpenAI Realtime model's language support at the time you
  deploy — this repository does not control or guarantee that quality.
- No SIP trunking support is implemented — only Twilio Programmable Voice
  (PSTN numbers). Adding SIP is a voice-service change, not an architecture
  change.
- The admin dashboard's opening-hours/holidays editor is a raw JSON
  textarea, not a calendar widget — deliberately simple for v1.
- Silence/timeout handling (check-in, then hang up) uses fixed thresholds
  (`SILENCE_CHECK_IN_SECONDS` / `SILENCE_HANGUP_SECONDS` in
  `apps/voice-service/src/config.ts`) rather than adaptive detection.
