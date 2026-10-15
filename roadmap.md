# Roadmap
- [x] Enable approved Uitsig parent Progression & Log on published hosts; 5 tests and signed-in desktop/mobile both views verified, 12 unique fixtures and one shared playoff; publication requested next, no tournament-data writes.
- [x] Uitsig R50 test knockout fees: 11 unpaid, uninvoiced NSP Knock out fees (R550) removed with 22 balanced reversal entries and 11 audit records; originals preserved, no payment/registration links, zero matching fees/net debt remain; signed-in member card verified R0. No publishing.
- [x] Bar remote-order fulfilment plan: inspected self/counter tab flows; proposed club-wide partial delivery checklist, collection/delivery choice, Bar Setup “Use order process” toggle and matching poster wording. No app/data changes or publishing; implementation and isolated pilot await approval.
- [x] Bar/shop QR setup: Poster (PDF) action, heading choice, large QR, instructions and saved enabled methods; 21 tests and signed-in Riverside downloads/visual PDF checks passed. Preview only; no settings/payment/stock changes, native downloads untested.
- [x] Uitsig preview-only parent Progression & Log: saved A1/A2 membership, stacked RR rankings/fixtures/results, one deferred shared Final; 24 tests + signed-in desktop/mobile verified, 12 unique fixtures, no writes/publish. Actual playoff qualifiers/pairings blocked by saved Define later / unspecified qualification count.
- [x] Riverside Progression & Log prominent solid category tabs — six tests passed; signed-in desktop/mobile category switching and screenshots verified, 64px/56px targets, no overflow/errors, no writes/publish. Marker blocker unchanged.
- [x] Phase 1 read-only Move/Swap preview built; 51 focused tests passed; signed-in Riverside desktop/mobile confirmed fail-closed no verified blocks. Interactive successful real-data drag remains unverified pending proven inventory. No writes/Phase 2.
- [x] Riverside calendar move/swap — read-only model/permissions/availability audit and staged plan prepared; 45 existing focused tests passed; no app/data changes or publishing.
- [ ] Riverside calendar actual move/swap Phase 2 — BLOCKED: separate owner approval, verified Android initialization recovery, proven reservation ownership and isolated write-testing without hardware/messages.
- [x] Riverside calendar tap scores: scoped immediate score-event updates + 5s polling, explicit live score pending, A/B score order; real Ndlovu FINAL and paused current points verified desktop/mobile, no writes/publishing.
- [ ] Active LIVE browser verification — BLOCKED: no active Riverside marker during checks; pending → live → final display covered by automated tests, no real score submitted.
- [x] Riverside RR rally-point totals: saved JSON/text agree; 33/11 and 33/22 mirrored per pool, 16 tests and signed-in desktop/mobile checks passed; existing realtime/10s refetch retained, no writes/publish.
- [x] Riverside RR matrix: compact mirrored set summary and completed light-green cells; 11 tests passed, real finals in all three pools and desktop/mobile screenshots verified; no writes/publish.
- [x] Riverside visual polish: independent Classic pool green-to-red shading with provisional cue, restrained RR/Swiss round accents; 20 focused tests and signed-in desktop/mobile screenshots, no writes/publish.
- [x] Riverside calendar retains scheduled finals; canonical live/final score adapter, refreshed details, real upcoming/final desktop/mobile checks and regression tests; no writes/publishing.
- [x] Riverside initial marker loading: 20-second abort/error/Retry, late-response guard, invalid proposed IDs rejected, duplicate-submit guard; real Upcoming route desktop/mobile and injected stalled read recovery verified without score writes.
- [ ] Owner's exact grid/Android hang request — BLOCKED: current positional preview has no Mark Game action; need the precise failing URL/screenshot to identify the original pending request. Native Android and real result submission not tested.

- [x] Hide Riverside pilot Swiss colored standings by default; optional classic standings and error/empty fallback preserved, factual current positions/results included; 103 tests pass and signed-in desktop/mobile/fullscreen checks completed; not published.

- [x] Riverside read-only positional grid preview: template slots in every round, factual saved Round 1 separated from proposed future rounds; tests and browser checks; no engine/data/publish changes.

- [x] Restore same-round saved wording for category-stage notification previews; 7 regression tests pass, build OK. Full selected-player browser verification could not complete.
- [x] Update only Uitsig Round 1 saved notification wording to specify free reserved evenings on 14 and 15 October; verified saved text, no messages or booking changes.

- [x] Correct fixtures/standings scoring reads and verify all eight category labels against saved setup (preview only; 17 tests and signed-in browser checks passed).

- [x] Champs match booking: reserved slots only for everyone (organiser toggle for all times)
- [ ] Redraw clears saved scheduling preferences (edit in progress)
- [ ] Open: publish pending re-place fix; Lienke Mens C re-add; Angelique ladies entry question (now moot if removed)
- [x] Merged duplicate Dino De Sousa (kept NSF4304)
- [x] Uitsig club ladder reordered from Club Champs lists (60 men, 19 ladies, ladies #1/#2 tie fixed); Coenraad/Ulrich/Etienne left at #154-#156 by owner choice
- [ ] Riverside-only tournament ladder pilot (builder opt-in, match/round/end timing, auto vs approve, running-tournament "Ladder Changes" panel with badge, audit/idempotency/reversal) — BLOCKED: needs owner OK for one additive shared-backend change (see report)
- [ ] Containment decision C1–C4 (sign-up email matching revert, etc.) — awaiting owner
- [ ] Club-only internal rating — DEFERRED, separate approval
- GoBook API card: fields read-only until Edit credentials; Save/Cancel while editing
- [ ] Wendy (Nelspruit doubles): can't edit players on LG fixture card — doubles teams (league_team_pairs) have no captain concept, so captain edit rights never apply; investigate + propose fix
- [x] Replace per-spirit Buddy buttons with standalone mixer tiles, including Coke Bulk, on phone and laptop; preview only.
- [x] Normal (non-special) orders: real Buddy at saved R22 with bottle image; bulk serving shown without its inventory container. Verified separate basket lines.
- [ ] Coke Bulk normal selling price — BLOCKED: both saved bulk records are R0; owner confirmation required, no price guessed from specials.
- [x] Buddy images: bottle on Coke Bulk, glass of coke on Glass 250ml (live)
- [x] Search box on Club Admin → Bar POS → Items & prices: filters by name, brand/group, category, variant, barcode; verified in preview (brandy 1, coke 5, no match 0, cleared 288). Preview only — publish pending.
- [ ] Offer: search box on the staff/customer bar menu screens (laptop POS + phone) — awaiting owner
- [x] Removed the "30 min match" pill from the bottom of the Champs booking dialog (preview only; publish pending).

- [x] Revert premature Swiss progression view + its Riverside switch; tests/typecheck pass
- [x] Phase 1: shared TournamentInteractiveViewer shell + Super Admin harness + pilot switches (preview only)
- [ ] Pool matrix view — awaiting approval to start
- [x] Swiss positional Phase 1: pure templates + tests (not wired in)
- [ ] Swiss positional Phase 2 — awaiting approval + SportyHQ 12/14/18 maps as exact pairs
- [x] Phase 2b: per-category Swiss rounds controls (entrants, suggested, editable selected) in real Riverside setup, flag-gated, ID-backed save/reload
- [x] Positional Swiss full-draw pilot (synthetic, Riverside only): engine, persistence, scheduling, pilot page, tests.
- [ ] Activate positional Swiss on a real tournament — waits on owner sign-off.
- [x] Riverside round-robin pilot Phase 1: read-only pool matrix + order of play (switch tournament_pool_matrix_view). Phase 2 (result entry) awaits approval.

- [x] Fixture calendar: date/time-slot layout, court labels per game, click a date to open day detail (read-only)
- [ ] Admin drag-to-reschedule (awaiting separate approval)
- [x] Riverside Tournaments: select tournament first; 3 tabs scoped to it (original Tournament Games list, progression, past); persist selection
- [x] Riverside Tournaments: all three tabs show content inline (no Open/Details second click)

- [ ] Uitsig GoBook blocks: Phase 0+2 logic done; blocked on backup/restore facility, GoBook test account, and go/no-go
- [x] Trace why Uitsig Club Champs progression log still shows Round 6 (source: swissRoundsConfirmed=6; set to 5)

- [x] Bar orders stage 1: Use order process switch (off by default), guest-tab order placement (collect/deliver), counter Orders list with item delivery (backend rehearsal passed, rolled back)
- [ ] Bar orders stage 2: member-account & online-pay orders, cancellations, poster "SCAN TO ORDER" wording
- [ ] REMIND OWNER: roll out grouped Men's A progression block (one-line switch in parent-progression.ts) to all clubs once Uitsig is signed off
