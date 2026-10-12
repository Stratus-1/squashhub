# Rankings & Ratings step — ladder timing, approval mode and SquashHub rating

## What exists today (audit)
- **Ladder participation (A):** `tournaments.ladder_affects` (old builder: inherit/yes/no; new builder: Yes/No switch added in preview, new = No). Club `ladder_configs.ladder_from_tournaments` is now the upper limit.
- **Timing (B):** only "after each finalized match". A database rule fires the moment a singles game is marked finished. No round or end-of-tournament option exists.
- **Mode (C):** club-wide only (`ladder_auto_apply`, ON at every club). OFF sends moves to an admin approval queue (`ladder_moves_pending`); approve/reject exists but does not record who approved or in what order the games were played.
- **Order:** moves apply in result-entry order, not game date/time.
- **Corrections:** changing a finished game's winner applies a new move and does **not** undo the original. Ranking points behave the same (duplicates prevented only for the identical winner/loser).
- **Rating engine:** there is **no internal SquashHub rating**. The only "points" are club ranking points (`club_members.ranking_points`): tournament results create rows awaiting admin approval (158 waiting, never applied automatically). SportyHQ ratings are separate imported data and stay untouched.

## Recommended safe defaults
- A: Off for new tournaments (already in preview); club permission always wins.
- B: "When the tournament is completed" for multi-week events; "After each finalized match" stays available.
- C: "Admin preview & approve" as default; "Automatic" optional.
- Existing tournaments keep today's behaviour (per match, club mode) unless an admin explicitly changes them.

## Build plan (Riverside-only opt-in first, per pilot policy)

### 1. Settings (new builder "Rankings & Ratings" step)
- Three clearly separate questions: A participate? B when? C automatic or approve?
- B and C hidden/disabled when A = No or the club disallows; club limits shown.
- Stored on the tournament: `ladder_timing` (match | round | completion, NULL = legacy per match) and `ladder_apply_mode` (auto | approve, NULL = club setting).
- Also shown read-only on the old builder card so both builders agree.

### 2. Ladder engine (one queue, applied in game order)
- Every eligible finished singles result writes one **ledger row** per game (unique per game + version) instead of moving the ladder directly when timing ≠ match.
- Milestone reached (round fully played / tournament completed) → batch is built and sorted by game date, then time, then game id.
- Automatic: batch applied in that order. Approve: admin sees a preview (before/after ladder) and approves or rejects the whole batch or single moves; approver, time and order are recorded.
- A game never applies twice (unique ledger key); a batch can only be applied once.

### 3. Corrections and reversals
- Correcting a game whose move is **not yet applied**: the ledger row is replaced, nothing to undo.
- Correcting a game whose move **was applied**: a reversal row is recorded and the admin is asked to confirm a re-apply; ladder positions already changed are never silently rewritten. Historical positions before rollout are not touched.
- The same reversal rule fixes today's per-match double-application for opted-in tournaments.

### 4. SquashHub internal rating (separate engine)
- New per-person rating (not SportyHQ, not official rankings), updated once per eligible verified match, regardless of the ladder switch.
- Needs your decision on the formula (e.g. Elo-style with starting value and K-factor) and which matches count (tournament / league / challenge, singles only?).
- One rating row per match (unique), corrections reverse and re-apply; never back-filled into historical data without approval.

### 5. Safety and rollout
- Kill switch: `NULL` settings = today's behaviour; a club-level flag enables the new engine for Riverside only.
- Synthetic-player end-to-end tests in Riverside (multi-week, out-of-order entry, correction after apply, approve/reject), plus tests proving other clubs unchanged.
- No publication, no live ladder changes, no messages until you sign off.

## Decisions needed before building
1. Approve this design for a Riverside-only pilot.
2. Rating formula and which match types count.
3. What to do now with the five running tournaments that inherit "move the ladder" (keep, or set to No).
