# SquashHub AI Development Guide

Multi-tenant squash operations platform (clubs, associations, federation, members): bookings, ladders, leagues, tournaments, live marking, billing, payments, access/devices, comms, PWA and Capacitor apps.

- Repo `Stratus-1/squashhub` (`main`). Docs: `ARCHITECTURE.md`, `README.md`, `MOBILE.md`, `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`, `docs/ANDROID_API_REFERENCE.md`.
- Scoped rules: `src/lib/AGENTS.md` (competition, bar, identity domain rules), `supabase/AGENTS.md` (Help Center feed).
- Step-by-Step Beta match scoring is device-local, with tournament default and category/subcategory overrides resolved only for planning; why: guided choices must not alter live competition rules before creation is supported.
- Step-by-Step Beta planned competition format (pools/knockout/swiss/cross-league/later) is device-local and provisional with category/subcategory overrides; playoffs derive from it and a "Confirm final format" checkpoint is required before any generation; why: format must never be fixed before real entries are known.
- Step-by-Step Beta seeding plan and the Club Champs branch (basics, per-group expected entries, per-group main-round end and playoff start, playoff synchronisation choice, per-stage play-by/scheduled plan with main-round and playoff phases scheduled independently) reuse the same answers object and shared steps, never a separate engine; seeds, stages and fixtures are only attached after the post-registration Final Format Review; why: one source of truth, and categories progress independently.
- Stack: React 18 + TS + Vite, React Router, React Query, Tailwind/shadcn, Supabase (Postgres/RLS/RPC/Edge Functions), PWA, Capacitor 8, FCM, Vitest, Remotion, Vercel.
- Commands: `npm run dev|test|lint|build|cap:sync`. Don't open native IDEs unless needed; review `cap:sync` output before committing.

## Before editing
- Read relevant docs and issue history before touching federation, mobile, booking, payment or device flows.
- Trace route → context → hooks → `src/lib` → tables/RLS/RPCs → Edge Functions → provider callbacks.
- Install needed dependencies proactively (prefer local); if an external connection loses auth, stop and ask the user to re-authenticate.

## Architecture rules
- Club, association, national and platform scopes are separate authorization boundaries; every club-owned query, cache key, channel, job and credential is scoped to its club/org. Capability flags are packaging, not security.
- Subdomains, `/c/:subdomain`, preview state and root-host admin routes form one routing contract.
- Competition state (draws, rounds, pools, progression, marker locks, lineups, results, rankings) are state machines with cross-table invariants: reuse `src/lib/tournaments/`, `src/lib/tournament-formats/`, `src/lib/leagues/`; never recreate rules in pages; add tests before changing them.
- Bookings affect availability, balances, visitors, reflow, lights, access and notifications. Device/integration boundaries (Shelly, routers, GoBook) need timeouts, retries, idempotency, audit logs; never expose device credentials to the browser. Shelly devices are managed only from the `IoT / Shelly` tile (`docs/IOT_DEVICE_OWNERSHIP.md`).
- Payment callbacks (Stitch, Yoco) retry/arrive out of order: handlers idempotent; server verification is authoritative; billing/ledger changes must be auditable.
- Preserve web, PWA, Android and iOS behaviour; deep links, OAuth, push and payment returns need platform testing; native config/signing is sensitive.
- Integrations: identify source of truth and credential owner, preserve external IDs/idempotency keys, document env vars by name only, log without secrets/PII.
- Supabase → GCP migration is incremental: one writable authority per domain per phase, authenticated service APIs, outbox/replayable workers; don't move live marking or booking without measuring realtime needs.

## Testing and secrets
- Extend existing suites; focused tests while developing, full test/lint/build for broad changes; schema changes need migration, RLS, RPC, types and cron review.
- Never read or expose `.env`, `secrets/`, Firebase/signing files, router/OAuth/payment credentials, member exports or PII. Service-role keys are server-only.

## Done checklist
Boundaries preserved; invariants tested; web/PWA/native impact stated; retries safe; migrations + types synced; `ARCHITECTURE.md` updated for boundary changes.
