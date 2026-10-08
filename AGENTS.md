# SquashHub AI Development Guide

- Repo `Stratus-1/squashhub` (`main`). Docs: `ARCHITECTURE.md`, `README.md`, `MOBILE.md`, `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`, `docs/ANDROID_API_REFERENCE.md`.
- Scoped rules: `src/lib/AGENTS.md` (competition, bar, identity domain rules), `supabase/AGENTS.md` (Help Center feed).
- Step-by-Step Beta rules: see `src/components/smart-builder/AGENTS.md`.
- Stack: React 18 + TS + Vite, React Router, React Query, Tailwind/shadcn, Supabase (Postgres/RLS/RPC/Edge Functions), PWA, Capacitor 8, FCM, Vitest, Remotion, Vercel.
- Commands: `npm run dev|test|lint|build|cap:sync`; review native sync.

## Before editing
- Read relevant docs and issue history before touching federation, mobile, booking, payment or device flows.
- Trace route → context → hooks → `src/lib` → tables/RLS/RPCs → Edge Functions → provider callbacks.
- External auth failure requires re-authentication; why: no bypass.

<!-- LOVABLE:BEGIN -->
- Scope member-home and club bottom-nav presentation locally; deduplicate only mobile shortcuts, preserving desktop/association access and domain hooks.
<!-- LOVABLE:END -->

## Architecture rules
- Scope Club Admin steps/contrast locally (portals too); why: shared member/association UI must stay unchanged.
- Club, association, national and platform scopes are separate authorization boundaries; every club-owned query, cache key, channel, job and credential is scoped to its club/org. Capability flags are packaging, not security.
- Subdomains, `/c/:subdomain`, preview state and root-host admin routes form one routing contract.
- Competition state (draws, rounds, pools, progression, marker locks, lineups, results, rankings) are state machines with cross-table invariants: reuse `src/lib/tournaments/`, `src/lib/tournament-formats/`, `src/lib/leagues/`; never recreate rules in pages; add tests before changing them.
- Bookings affect availability, balances, visitors, reflow, lights, access and notifications. Device/integration boundaries (Shelly, routers, GoBook) need timeouts, retries, idempotency, audit logs; never expose device credentials to the browser. Shelly devices are managed only from the `IoT / Shelly` tile (`docs/IOT_DEVICE_OWNERSHIP.md`).
- Tournament court-slot ownership comes from the structured stage rule or explicit legacy club mode without a linked player booking, never from saved date/time alone; why: player-booked fixtures must retain rescheduling and their play-by deadline.
- Payment callbacks (Stitch, Yoco) retry/arrive out of order: handlers idempotent; server verification is authoritative; billing/ledger changes must be auditable.
- Preserve web, PWA, Android and iOS behaviour; deep links, OAuth, push and payment returns need platform testing; native config/signing is sensitive.
- Integrations: identify authority and credential owner; preserve external IDs/idempotency keys; document env names only; never log secrets/PII.
- Supabase → GCP migration is incremental: one writable authority per domain per phase, authenticated service APIs, outbox/replayable workers; don't move live marking or booking without measuring realtime needs.

## Testing and secrets
- Extend existing suites; focused tests while developing, full test/lint/build for broad changes; schema changes need migration, RLS, RPC, types and cron review.
- Never read or expose `.env`, `secrets/`, Firebase/signing files, router/OAuth/payment credentials, member exports or PII. Service-role keys are server-only.

## Done checklist
Boundaries preserved; invariants tested; web/PWA/native impact stated; retries safe; migrations + types synced; `ARCHITECTURE.md` updated for boundary changes.
- Beta builder management cards are device-local projections verified against club-scoped tournament rows, and card removal never deletes a real tournament; why: a stale local record must not survive deletion or erase competition history.
- Access devices may carry an optional `club_devices.min_age` (NULL = unrestricted); device-control enforces it server-side on unlock via `_shared/member-age.ts` (DOB, then SA ID), unknown age is a separate denial from underage, and denials log to access_events; why: one reusable age gate, never a club-specific hard-code.
- Comms template channel versions are always loaded filtered by the club's template IDs, and the onboarding template is identified by `action.key = register_existing_member`, never by display name; why: unfiltered reads hit the 1000-row API cap for platform admins and renames must not break lookup.
- Outstanding-balance plans (`mandate_arrears_plans`) are separate from fee mandates: they finance only `member_outstanding_breakdown().uncovered`, snapshot `covered_fee_ids`, and may share one combined debit, but each component is settled/tracked separately and the plan part drops off when done; why: no double-financing of membership.
- Peak late-cancel limits and penalties are separate opt-in switches (OFF/0); penalties only for SquashHub-lit clubs, once per booking, never backdated; why: no accidental charges.
- Court grids share P and peak logic; why: no separate rules.

- Personal menu order/hidden items live in `user_menu_preferences` (per user + club) and are applied only after permission filtering via `src/lib/menu-order.ts`; why: display preference must never reveal or grant access.
