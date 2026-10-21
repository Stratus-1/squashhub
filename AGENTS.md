# SquashHub AI Development Guide

- Repo `Stratus-1/squashhub` (`main`). Docs: `ARCHITECTURE.md`, `README.md`, `MOBILE.md`, `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`, `docs/ANDROID_API_REFERENCE.md`.
- Scoped rules: `src/lib/AGENTS.md` (competition, bar, identity domain rules), `supabase/functions/AGENTS.md` (device age gate, arrears plans), `supabase/AGENTS.md` (Help Center feed).
- Step-by-Step Beta, tournament admin UI and Swiss round-count rules: see `src/components/smart-builder/AGENTS.md`.
- Stack: React 18 + TS + Vite, React Router, React Query, Tailwind/shadcn, Supabase (Postgres/RLS/RPC/Edge Functions), PWA, Capacitor 8, FCM, Vitest, Remotion, Vercel.
- Commands: `npm run dev|test|lint|build|cap:sync`; review native sync.

## Before editing
- Read relevant docs and issue history before touching federation, mobile, booking, payment or device flows.
- Trace route → context → hooks → `src/lib` → tables/RLS/RPCs → Edge Functions → provider callbacks.
- External auth failure requires re-authentication; why: no bypass.

<!-- LOVABLE:BEGIN -->
- Bar/shop GL routing follows club-scoped item division and preserves receipt idempotency; new purchases have one balanced journal per line, and division margins use sales less purchases rather than optional COGS; why: separate trading without double-counting costs or rewriting history.
- Scope member-home and club bottom-nav presentation locally; deduplicate only mobile shortcuts, preserving desktop/association access and domain hooks.
- Generate draw leaves player ordering and scheduling in setup; only format confirmation, read-only scoring and necessary pool allocation appear here; why: avoid conflicting copies.
- Bar menus share spirit-category mixer inclusion in `src/lib/bar-spirit-menu.ts`, preserving original IDs and independent basket lines; why: display changes must not create combo sales or alter stock definitions.
- Row structure projects existing StepAnswers through pure adapters and is gated to flagged Riverside preview new drafts; why: one authority, no live tournament autosave or global layout change.
- Closed bar-tab history uses read-only club-scoped pagination and Johannesburg closure dates; why: no settlement changes or silently truncated history.
- Revised Swiss finals templates are opt-in in the positional display only, separate from default/writer projections; why: preview review must not change live fixtures or generation.
- Category calendars consume a separate tournament-wide saved-fixture projection; why: highlighting must not filter shared fixtures or change category pairing, standings or scheduling.
- NSC verified ladder results use a member-first, match-stamped handler and the existing mixed-ladder movement engine; legacy NSC challenge effects and client awards are bypassed there; why: missing challenge links must not prevent movement or duplicate awards.
<!-- LOVABLE:END -->

## Architecture rules
- Counter tab-opening requests supply all six named arguments, with an explicit null member ID for visitors; why: older defaulted RPC overloads otherwise make visitor requests ambiguous.
- Booking grid uses saved tournament duration, not historical booking lengths, inside reserved evenings; fixture slots preserve that interval, other courts keep club slots, overlaps stay separate; why: setup changes must not retain stale short rows or move bookings.
- Booking writes enforce scheduled, unlinked championship allocations through `guard_scheduled_championship_booking`, using saved fixture duration without an admin bypass; why: capacity holds must not conceal already assigned games.
- Scope Club Admin steps/contrast locally (portals too); why: shared member/association UI must stay unchanged.
- Club, association, national and platform scopes are separate authorization boundaries; every club-owned query, cache key, channel, job and credential is scoped to its club/org. Capability flags are packaging, not security.
- Subdomains, `/c/:subdomain`, preview state and root-host admin routes form one routing contract.
- Competition state (draws, rounds, pools, progression, marker locks, lineups, results, rankings) are state machines with cross-table invariants: reuse `src/lib/tournaments/`, `src/lib/tournament-formats/`, `src/lib/leagues/`; never recreate rules in pages; add tests before changing them.
- Tournament viewing and setup hydration perform no hosted writes; setup draft saving and stage generation require explicit organiser actions, with scheduling separate from draft persistence; why: inspecting an existing tournament must never alter live play.
- Riverside RR finish must reach both structured next-round generation and the decided-fixture projection/writer, with category-scoped stage-config mirrors kept in sync; why: production auto-progression uses the projection path rather than only the engine's next-round function.
- Bookings affect availability, balances, visitors, reflow, lights, access and notifications. Device/integration boundaries (Shelly, routers, GoBook) need timeouts, retries, idempotency, audit logs; never expose device credentials to the browser. Shelly devices are managed only from the `IoT / Shelly` tile (`docs/IOT_DEVICE_OWNERSHIP.md`).
- Tournament court-slot ownership comes from the structured stage rule or explicit legacy club mode without a linked player booking, never from saved date/time alone; why: player-booked fixtures must retain rescheduling and their play-by deadline.
- Payment callbacks (Stitch, Yoco) retry/arrive out of order: handlers idempotent; server verification is authoritative; billing/ledger changes must be auditable.
- Preserve web/PWA/Android/iOS; test deep links, OAuth, push, payment returns per platform; native signing is sensitive.
- Integrations: identify authority and credential owner; preserve external IDs/idempotency keys; document env names only; never log secrets/PII.
- Supabase → GCP migration is incremental: one writable authority per domain per phase, authenticated service APIs, outbox/replayable workers; don't move live marking or booking without measuring realtime needs.

## Testing and secrets
- Extend existing suites; focused tests while developing, full test/lint/build for broad changes; schema changes need migration, RLS, RPC, types and cron review.
- Never read or expose `.env`, `secrets/`, Firebase/signing files, router/OAuth/payment credentials, member exports or PII. Service-role keys are server-only.

## Done checklist
Boundaries preserved; invariants tested; web/PWA/native impact stated; retries safe; migrations + types synced; `ARCHITECTURE.md` updated for boundary changes.
- Peak late-cancel limits and penalties are separate opt-in switches (OFF/0); penalties only for SquashHub-lit clubs, once per booking, never backdated; why: no accidental charges.
- Court grids share P/peak logic; why: one rule set.

- Menu prefs apply after permission filtering; why: never grant access.
- Dense tournament views use the display-only `TournamentInteractiveViewer`, gated by per-club `club_beta_features` rows set from Super Admin, never migration-seeded; why: one zoom behaviour, safe pilots.
- Clean round-robin tracks use pointer-captured mouse drag scrolling and native touch scrolling, excluding interactive controls; why: fixture/result navigation must never mutate tournament data or intercept standings actions.
