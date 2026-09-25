# Roadmap

## Tournament Beta display and Bells scoring (24 Sep 2026)
- [x] Make native dropdown options readable throughout Tournament Beta
- [x] Make Schedule defaults and stage overview legible at Riverside-sized widths
- [x] Recognise timed Bells scoring as resolved without asking for PAR/best-of; preserve existing draft settings

- [x] Show Nelspruit Family Doubles standings as separate Pool A and Pool B tables for saved single-round-robin divisions

- [x] Restore NSA venue club choices by resolving the Federation owner across all association league rows
- [x] Align regional tournament venue and entrant clubs with the Federation tree; exclude stale affiliations such as Durbanville from NSA
- [x] Resolve cross-club entrant names on the regional tournament review and post-rebuild schedule without changing fixtures
- [x] Group association tournament players by expandable club with individual and club selection

- [x] Show active Bells tournament games as one chronological schedule without round headings
- [x] Remove Karel Budler's attendance (decline RSVP) for Thu 17 Sep 2026 Thursday Social (CSIR club)
- [x] Add 36-hour option to event reminder settings (CreateClubEvent form + reminder selection)
- [x] Ensure a scheduled job runs the event reminders (in-app + WhatsApp/email when chosen) at the configured hours-before time (24h or 36h) — daily cron `event-reminders-daily` at 06:00 SA
- [x] Confirm 24-hour reminders for tomorrow's event fire correctly once cron is wired — manual smoke test sent 8 in-app + 8 WhatsApp reminders; booking-null-UUID crash fixed; one-send-per-occurrence dedup in place
- [ ] Awaiting Willem's fresh Nelspruit guest tournament payment result (new link should contain nsc.squashhub.co.za/my-account)
- [ ] Deploy `family-invite` edge function (written, not deployed)
- [ ] Monitor Meta approval of the button-free `rsvp_question` template (v4)
- [x] Fix the Family Doubles accepted/unpaid invitation state so verification resumes the existing partner choice or loads eligible partners
- [x] Allow one Family Doubles invite holder to create multiple exact pairs and pay each selected player once
- [x] Correct Rachel's guest Stitch amount from R150 to R300 for her active two-player pair
- [x] Replace the stale app-shell worker that made valid tournament invitations appear unavailable on installed Android phones
- [x] Make the public tournament invitation lookup backward-compatible with short codes from older cached phone pages
- [x] Treat a player pulled out of a tournament as knocked out: no further fixtures/byes, name shown with a strike-through
- [x] Move the automatic tournament invitation opening into the editable preview text so reminders can replace or remove it
- [x] Restore browser push notifications with a notification-only worker and prevent endless setup waits
- [x] Make tournament result emails stage-aware (quarter-final, semi-final, champion, runner-up and placement wording)

## WhatsApp invite wording (16 Sep 2026)
- [x] Short, friendly invitation link instead of the long token URL
- [x] Reword invite: single "tap here to accept or decline" (new template awaiting WhatsApp approval)

## Cross-gender league play (18 Sep 2026)
- [x] Ladies with recent men's-league history offered automatically in men's league fill pools
- [x] Dual ladder listing + men's ranking for those ladies (ladies' position preserved)
- [x] Default ON for NSA clubs (association default), club override available
- [x] Cross-listed ladies exempt from the ±2 position movement cap — may play any men's league level

## Monthly card payments with PayFast (18 Sep 2026)
- [x] Tokenised monthly arrangements (create/cancel/daily charge) + activation on payment notice
- [x] Member view (My Account) and club admin panel support both gateways
- [x] PayFast payment-notice signature accepted in all valid forms; Gerhard's R20 top-up posted
- [ ] Daily schedule for payfast-charge-mandates
- [ ] First live monthly arrangement as a real-money test

## Court slots & GoBook banner (18 Sep 2026)
- [x] Fix contradictory GoBook banners (setup-incomplete shown alongside live grid) — API mode no longer requires a URL
- [x] Add 45-minute court slot option (settings dropdown, grid, duration choices 45/90)
- [x] Verify build clean

- [ ] Check Lizani Slippers live-scoring dropouts (Nelspruit tournament)

## Nelspruit round labelling (18 Sep 2026)
- [x] League play-off gate uses total survivors (2/4/8) not "every pool decided"
- [x] Round headings prefer each fixture's own stage label over "Round N"
- [ ] Round headings group by stage, not round number (semi-finals under a QF heading)
- [ ] Play-by date shown per heading must match the round actually planned

## Nelspruit third-league final (20 Sep 2026)
- [x] Create Hendrik Vorster v Raymond Gates final with play-by date 22 Sep 2026
- [x] Keep later cross-pool rounds on the finals draw path after section 0 already exists
- [x] Pass the central Final deadline into the progress-card draw confirmation


## 23 Sep 2026
- [x] Add John & Simone Cussons as paid pair (John pays R300) in Nelspruit Family Doubles
- [x] Players tab visible at all times in tournament wizard (even before pairs exist)
- [x] Make CSIR rotating-doubles player removal a persistent withdrawal, with a dedicated action on the Players tab
- [x] Show tournament participants first on Players, then remaining members alphabetically

- [ ] Durbanville: check WP (Western Province) league numbers for players
- [ ] Populate people.ssa_membership_number for all members (SportyHQ "Membership ID" scrape) and show it in member/federation views
- [ ] WP league: import per-fixture rubber scores (draw_results pages) and schedule a periodic standings refresh

## Tournament withdraw / rebuild (Sep 23)
- [x] Rebuild uses only current active entrants + saved settings (rotating doubles: played games count toward cap)
- [x] Players-tab "Withdraw from tournament" pre-start: auto-clear unplayed fixtures, no manual pull-out
- [x] Post-start: controlled pull-out/forfeit, preserve results; clear wording

## AI Assistant live tournament repair (24 Sep 2026)
- [x] Live tournament self-heal: integrity engine, automatic deterministic repair (no approval), verify/rollback, audit, admin alerts, Afrikaans/voice tested
- [ ] "Working…" background reply + polling for requests over ~20s (not built; current replies ~11s)
- [ ] Approve/Decline card for judgement items (currently reported in chat + escalated)

- [x] Tournament Beta opening steps (model, readiness order, AI order; live coverage lookup still open): owner/scope -> audience (explicit league-only vs all members) -> ranking coverage -> expected entries, before format.

## Tournament Beta — structural phase (2026-09-24)
- [x] Structural tables: divisions/stages/pools(optional)/rounds + fixture refs (additive), architecture discriminator
- [x] Beta Create persists structure first, then fixtures via engine-service with integrity checks
- [x] Rebuild/withdrawal/advancement/playoff preview+confirm on structural model
- [x] Structured Tournament Editor reloads persisted spec; change-impact preview
- [x] Builder UI: division names, league use, pool names, apply-to-other-divisions
- [ ] Connect real eligible counts / ranking coverage
- [x] Rotating doubles respects max games
- [x] Beta Create persists structured spec + divisions/stages/pools before games
- [x] Tournament page routes structured tournaments to structured engine (legacy generate/auto-fill disabled)
- [x] Structured rebuild/withdrawal wired into page (legacy rebuild inserts are DB-blocked for structured)
- [x] Transactional server-side generate (currently client multi-step, DB triggers enforce identity)
- [x] Structured Tournament Editor reload UI; builder questions (division/pool names, league use, apply-to-all)
- [x] Disposable full simulation
- [x] Fast "I know what I want" path: RR / Swiss / Knockout / Pools→Play-offs / Custom, progressive questions, same spec + engine, tournament map
- [x] Double round robin, Swiss (generation + next round + tie-breaks), 3rd/4th place match

## Tournament Beta standalone operation (25 Sep 2026)
- [x] Derive round counts and auto-generate weekly round dates; persist onto created rounds/fixtures
- [x] Audit step 1: verify schedule dialog on Beta games, result emails, reminders, member pages
- [x] Audit step 2: Beta tournament Operate page
- [ ] Audit step 3: Beta entries and allocation
- [ ] Audit step 4: bulk scheduling
- [ ] Audit step 5: stage-complete prompts, "automatic" behaviour, complete tournament
- [ ] Audit step 6: full Diamond League browser run

- [ ] Diamond League (Uitsig) Beta Builder template: singles-results re-rank -> doubles, 5 Wednesdays from 7 Oct, 8 named pools, open category, 48 cap + waitlist, unresolved scoring/final/W4-W5
