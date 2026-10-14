# Roadmap
- [ ] Riverside visual polish: independent Classic pool green-to-red shading with provisional cue, restrained RR/Swiss round accents; tests and desktop/mobile screenshots, no writes/publish.
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
