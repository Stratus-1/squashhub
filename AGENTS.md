# SquashHub AI Development Guide

- Repo `Stratus-1/squashhub` (`main`). Docs: `ARCHITECTURE.md`, `README.md`, `MOBILE.md`, `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`, `docs/ANDROID_API_REFERENCE.md`.
- Scoped rules: `src/lib/AGENTS.md` (competition, bar/cash-up/staff/counter, identity domain rules), `supabase/functions/AGENTS.md` (device age gate, arrears plans), `supabase/AGENTS.md` (Help Center feed).
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
- Tournament final-ladder adjustments use a club-scoped, permission-checked preview/apply RPC with completion and stale-preview guards; only participants' occupied slots change, and an explicit tournament timing choice preserves legacy per-match behaviour until selected. Why: final standings must not reseed outsiders or mutate ladders during viewing/deployment.
- Tournament Paid uses the club-scoped atomic `champ_admin_confirm_paid` action for existing champs/fees/finance permissions, settling only a linked existing fee and auditing once; why: finance staff must not require full tournament management or risk half-completed browser writes.
- Counter menu shortcut visibility uses the club membership or named local PIN-session hint; serving authority remains the existing server-validated personal PIN, with direct PIN entry preserved. Why: hide staff navigation from guests without granting account-based serving bypasses.
- Signed-in self-service bar selections stay device-local until My Tab is explicitly opened, then use the shared unpaid-tab writer before existing payment choices; staffed order submission remains explicit and payment switches remain club-owned. Why: no empty-tab prerequisite, no charge on selection, and one settlement authority.
- League fixture entry distinguishes partial saved scores from final submitted scorecards; only past/final results use correction mode, because ongoing court scoring must stay accessible after each rubber finishes.
- GoBook balances are read-only external snapshots resolved server-side from an authorized active club member's saved client link; shared account/booking display never changes credits, bookings or member links, because GoBook is the balance authority.
- Courts capacity is a read-only aggregate projection of canonical stage plans, player/pair counts and unioned saved court windows; unresolved qualification stays provisional and fit never implies timetable feasibility, because viewing setup must not generate or reschedule games.
- Picked-player pool previews reuse reciprocal-pair validation, combined ranking-point seeding and the shared snake allocator; previews are read-only and unpaired doubles block placement rather than inventing partners, because category lists are not pool membership.
- Recurring social-event attendance is occurrence-scoped across notification actions, event detail, cards and WhatsApp; series rows are invite membership only, selected channels are enforced before notification delivery and reminder email uses one explicit outbox path; why: prior answers and generic notification bridges must never imply weekly attendance or bypass switches.
- New membership availability uses the public boolean RPC for signed SLAs, unexpired active trials and explicit owner exceptions; signup/join writers enforce it while retaining existing-member linking; why: hiding a button alone cannot prevent unnoticed applications or expose private SLA details.
- Swiss sequencing is a tournament-bound prospective policy minted only on fresh first-draw generation; existing Uitsig IDs are denied by shared writer/save guards and keep legacy projections. Use the pure weighted matching optimizer for enrolled new tournaments only; why: deployment and routine viewing/saving must never adopt new pairings for existing events.
- Riverside hybrid opening-round views show canonical saved fixture blocks even when a reused exact preview chart differs; Uitsig chart routes remain unchanged; why: recorded results must never be hidden behind hypothetical opponents or leaked into other rounds.
- Pending Swiss previews use paired numeric slots with null participant IDs; Riverside AABB Ladies B may preview final current-rank non-repeat matching without enrolling its persisted engine policy; why: a positional target is not a committed fixture, and display corrections must preserve existing draws.
- Booking grid uses saved tournament duration, not historical booking lengths, inside reserved evenings; fixture slots preserve that interval, other courts keep club slots, overlaps stay separate; why: setup changes must not retain stale short rows or move bookings.
- Booking writes enforce scheduled, unlinked championship allocations through `guard_scheduled_championship_booking`, using saved fixture duration without an admin bypass; why: capacity holds must not conceal already assigned games.
- Scope Club Admin steps/contrast locally (portals too); why: shared UI stays unchanged.
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
- Peak late-cancel limits/penalties are separate opt-in switches (OFF/0), shared by all court grids; penalties only for SquashHub-lit clubs, once per booking, never backdated; why: no accidental charges.

- Menu prefs apply after permission filtering (never grant access).
- Dense tournament views use the display-only `TournamentInteractiveViewer`, gated by per-club `club_beta_features` rows set from Super Admin, never migration-seeded; why: one zoom behaviour, safe pilots.
- Clean RR tracks drag-scroll (mouse pointer capture, native touch), excluding controls; why: navigation must never mutate data or block standings actions.
- Standalone round-robin presentation uses the shared clean view across clubs without pilot flags; format-specific projections and viewer zoom gates remain separate because a display rollout must not alter competition rules or permissions.
- Clean round-robin pool viewers use compact phone frames and opt-in compact viewer controls, keeping desktop sizes and expanded zoom/pan unchanged; why: stacked pools must remain discoverable without empty frame space.
- Standalone RR round panels read the structured stage's round-date count; the pure view compacts balanced legacy labels and uniquely partitions complete four-player pools, retaining every saved fixture/result/slot without writes; ambiguous or incomplete schedules stay factual because display must never invent pairings.
- Uitsig Ladies B fixture-list headings prefer confirmed category-scoped deadline rounds, falling back to the pure pool ID projection; approved deadline corrections update fixture overrides, linked legacy round overrides and stage schedule together with audit, preserving results/allocations; why: incomplete member lists cannot project whole pools and must still agree with bookable deadlines.
- Member "Available to spend" reuses the booking/bar gate inputs (allowance = recurring-plan fees + approved credit, minus owing) via existing read-only RPCs; why: the dashboard must never disagree with what the till or booking screen allows.
- AGM (see src/components/club-admin/comms/AGENTS.md): secrecy, one vote, deadline and post-close results live in security-definer RPCs; votes never reference members; why: UI can't secure a secret ballot.
- AGM run-offs are immutable-parent child ballots for server-computed tied remaining seats; token resolution follows child rounds and locks each round's voter independently; why: original results and receipts stay intact while every eligible member gets one new secret vote.
- AGM storage reads use the boolean-only exact attached-path definer check, never an invoker query of protected ballot rows; why: attendance-link downloads must work without exposing ballot or voter data.
