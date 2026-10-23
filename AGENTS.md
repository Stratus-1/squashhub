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
- Shared counters retain venue-scoped personal-PIN sessions with one active serving token, revalidated on selection; adding/selecting staff never ends attendance, End shift removes only that person and confirmed device exit ends local participants; why: concurrent staff need separate hours and authoritative sale attribution without changing cash-up or payroll.
- Staff attendance is independent of PIN-session lifetime and cash reconciliation: club-scoped work shifts hold individual paid intervals, shared tips use immutable cent allocations and one staff-earnings read model, and payroll snapshots an attendance cutoff; why: concurrent staff, late-earned tips and delayed approval must not duplicate hours or payments.
- Payday overrides are per-run review snapshots preserving original values; month-end preview uses read-only accruals and cannot confirm or prepare a run; why: checking pay must not rewrite attendance, future rates or financial records.
- Swiss sequencing is a tournament-bound prospective policy minted only on fresh first-draw generation; existing Uitsig IDs are denied by shared writer/save guards and keep legacy projections. Use the pure weighted matching optimizer for enrolled new tournaments only; why: deployment and routine viewing/saving must never adopt new pairings for existing events.
- Riverside hybrid opening-round views show canonical saved fixture blocks even when a reused exact preview chart differs; Uitsig chart routes remain unchanged; why: recorded results must never be hidden behind hypothetical opponents or leaked into other rounds.
- Pending Swiss previews use paired numeric slots with null participant IDs; Riverside AABB Ladies B may preview final current-rank non-repeat matching without enrolling its persisted engine policy; why: a positional target is not a committed fixture, and display corrections must preserve existing draws.
- Cash-up date labels use optional totals.cash_up_date metadata, never reconciliation cutoffs; why: correcting an evening label must not move sales between shifts or change opening cash.
- Counter tab-opening requests supply all six named arguments, with an explicit null member ID for visitors; why: older defaulted RPC overloads otherwise make visitor requests ambiguous.
- Booking grid uses saved tournament duration, not historical booking lengths, inside reserved evenings; fixture slots preserve that interval, other courts keep club slots, overlaps stay separate; why: setup changes must not retain stale short rows or move bookings.
- Booking writes enforce scheduled, unlinked championship allocations through `guard_scheduled_championship_booking`, using saved fixture duration without an admin bypass; why: capacity holds must not conceal already assigned games.
- Scope Club Admin steps/contrast locally (portals too); why: shared member/association UI must stay unchanged.
- Club, association, national and platform scopes are separate authorization boundaries; every club-owned query, cache key, channel, job and credential is scoped to its club/org. Capability flags are packaging, not security.
- Subdomains, `/c/:subdomain`, preview state and root-host admin routes form one routing contract.
- Competition state (draws, rounds, pools, progression, marker locks, lineups, results, rankings) are state machines with cross-table invariants: reuse `src/lib/tournaments/`, `src/lib/tournament-formats/`, `src/lib/leagues/`; never recreate rules in pages; add tests before changing them.
- Tournament viewing and setup hydration perform no hosted writes; setup draft saving and stage generation require explicit organiser actions, with scheduling separate from draft persistence; why: inspecting an existing tournament must never alter live play.
- Riverside RR finish must reach both structured next-round generation and the decided-fixture projection/writer, with category-scoped stage-config mirrors kept in sync; why: production auto-progression uses the projection path rather than only the engine's next-round function.
- Hybrid Swiss/RR standings use shared `hybridSwissTable`: R2 freezes RR pairing labels, remainder rankings stay inside their cohort and later RR results cannot change Swiss tie-breaks; why: saved grids and generators must never assign a Swiss player a fixed-group position.
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
- Standalone round-robin presentation uses the shared clean view across clubs without pilot flags; format-specific projections and viewer zoom gates remain separate because a display rollout must not alter competition rules or permissions.
- Clean round-robin pool viewers use compact phone frames and opt-in compact viewer controls, keeping desktop sizes and expanded zoom/pan unchanged; why: stacked pools must remain discoverable without empty frame space.
- Standalone RR round panels read the structured stage's round-date count; the pure view compacts balanced legacy labels and uniquely partitions complete four-player pools, retaining every saved fixture/result/slot without writes; ambiguous or incomplete schedules stay factual because display must never invent pairings.
- Cash-up UI exposes only View / edit and audited Save changes, with no Undo handler or deletion/reopening action; why: correcting a saved reconciliation must retain its shift record.
- Full saved cash-up edits use signed-in reason-required correction RPCs with expected-original snapshots, deterministic payout ownership and staff locks; append balanced reconciliation/payout adjustments, audit selected and next-shift opening corrections, preserve shift dates and later counted cash, and bound additions by historical and current earned-tip balances; why: all normal entry fields remain correctable without deleting a shift or silently distorting later reconciliations.
- The till cash-up history exposes the existing management report for signed-in platform admins; edits require server authorization and a reason, and counter PIN authorization stays unchanged; why: platform admins need direct access to corrections without granting anonymous management access.
- Club-sponsored stock shares private `_bar_club_use_post` between bar-authorised signed-in entries and atomic personal-PIN counter baskets; counter club/staff identity comes only from a locked valid session and private request rows enforce idempotency; why: one stock/accounting path, no admin bypass, customer tab, sale or duplicate deduction.
- Member "Available to spend" reuses the booking/bar gate inputs (allowance = recurring-plan fees + approved credit, minus owing) via existing read-only RPCs; why: the dashboard must never disagree with what the till or booking screen allows.
