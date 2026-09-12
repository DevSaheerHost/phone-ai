# Deployment Guide

This expands on the [README's deployment section](../README.md#production-deployment)
with concrete per-environment steps. Read that section first for the
high-level picture.

## Required accounts/services

| Service                   | Used for                                                                                        | Sign up                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| Supabase                  | Postgres database, Auth for the admin dashboard                                                 | https://supabase.com        |
| Twilio                    | Phone number, Programmable Voice, Media Streams, call transfer                                  | https://www.twilio.com      |
| OpenAI                    | Realtime speech-to-speech model                                                                 | https://platform.openai.com |
| A persistent Node.js host | `apps/voice-service` (Fly.io, Railway, Render background worker, or your own VM/ECS/Kubernetes) | —                           |
| Vercel (or any Node host) | `apps/web` admin dashboard                                                                      | https://vercel.com          |

## Environments

Keep **development**, **staging**, and **production** fully separate:

- A distinct Supabase project per environment (different `SUPABASE_URL`).
- A distinct Twilio phone number per environment, so a staging call never
  rings the real shop's transfer line.
- Distinct `.env` files / secret stores per environment — never share a
  `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` across environments.

## 1. Database setup

```bash
supabase link --project-ref <project-ref>
supabase db push               # applies supabase/migrations/*.sql
```

For a first environment, also load starter data (edit `supabase/seed.sql`
with your real shop details first, or apply it as-is and edit via the
dashboard afterward):

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Grant dashboard access to each staff member once they've signed up through
Supabase Auth:

```sql
insert into admin_roles (user_id, role)
values ('<their-auth-user-uuid>', 'admin');
```

## 2. Voice-service deployment

Build and run the Docker image (`apps/voice-service/Dockerfile`) on a host
that keeps a **persistent process** — this is not optional, since each
active call holds two long-lived WebSocket connections (Twilio Media
Streams + OpenAI Realtime) for the call's duration.

```bash
docker build -f apps/voice-service/Dockerfile -t phone-ai-voice-service .
docker run -p 8080:8080 --env-file apps/voice-service/.env phone-ai-voice-service
```

Platform notes:

- **Fly.io / Railway / Render (background worker or web service)**: all
  support long-lived WebSocket connections on a standard/persistent
  instance — do not deploy this as a "function" or "serverless" target.
- **A plain VM / ECS / Kubernetes**: put it behind a load balancer that
  supports WebSocket upgrade and doesn't impose a short idle timeout
  (calls can run for many minutes).
- Terminate TLS at your load balancer/platform edge; `PUBLIC_BASE_URL`
  must be the externally-reachable HTTPS URL.

Set every variable in `.env.example` for this service in your platform's
secret manager — do not bake them into the image.

## 3. Web dashboard deployment (Vercel)

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel deploy --prod
```

Only the two `NEXT_PUBLIC_*` variables are needed here — never add
`SUPABASE_SERVICE_ROLE_KEY` to this project.

## 4. Twilio number configuration

In the Twilio Console, on the phone number's configuration page:

- **A call comes in**: Webhook, `POST`, `https://<voice-service PUBLIC_BASE_URL>/twilio/voice`
- **Call status changes**: Webhook, `POST`, `https://<voice-service PUBLIC_BASE_URL>/twilio/status`

`PUBLIC_BASE_URL` must match exactly (scheme + host, no trailing slash) —
it's part of what Twilio signs, so a mismatch fails signature verification
on every request.

## 5. Health checks

Point your platform's health/readiness probes at:

- `GET /health` — liveness (always 200 if the process is up)
- `GET /ready` — readiness (503 if the database is unreachable)

Both exist on `apps/voice-service` and `apps/web`.

## 6. Rollback procedure

- **Voice-service**: redeploy the previous image tag/build. Twilio webhook
  URLs point at the service, not a specific deployment, so no Twilio-side
  change is needed.
- **Web dashboard**: use your host's rollback (e.g. `vercel rollback`, or
  redeploy a previous commit).
- **Database**: migrations in this project are additive (new tables/columns,
  no destructive drops). If you ever need to write a destructive migration,
  write and test its down-path before applying it to production, and take
  a Supabase backup/snapshot first.

## Post-deploy verification

Follow the [First test call procedure](../README.md#first-test-call-procedure)
in the README against the newly deployed environment before considering it live.
