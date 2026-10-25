# Tournament View Templates — FINAL

Frozen 25 Oct 2026. These are the approved, final presentation templates for the
round-robin and Swiss progression, standings and play-off views. Any change to
layout, columns, colours, labels or interaction described here requires explicit
owner approval. All views are **display-only**: they read saved fixtures, results
and standings and never write tournament data, create bookings or send notices.

Source of truth files:
- `src/pages/ClubChampsView.tsx` — composition layer (pool views, stage routing, classic standings fallback)
- `src/components/tournaments/viewer/TournamentInteractiveViewer.tsx` — shared viewer shell
- `src/components/tournaments/RoundRobinPilotView.tsx` — RR clean/combined/matrix views
- `src/components/tournaments/SwissProgressionPilotView.tsx` — Swiss grid/log/calendar tabs
- `src/components/tournaments/SwissPositionGrid.tsx` — Swiss grid panels + current positions
- `src/components/tournaments/SwissRrFinishStandings.tsx` — hybrid Swiss/RR group standings
- `src/components/tournaments/PlannedPlayoffBracketView.tsx` — connected play-off bracket
- `src/components/tournaments/KnockoutBracketView.tsx` — classic knockout bracket
- `src/components/tournaments/ParentCategoryProgression.tsx` — grouped progression block
- Data/pure logic: `src/lib/tournaments/round-robin-view.ts`,
  `src/lib/tournaments/swiss-progression-view.ts`, `src/lib/tournaments/swiss-rr-finish.ts`
  (`hybridSwissTable`), `src/lib/tournaments/rr-final-ranking.ts`,
  `src/lib/tournaments/planned-playoff-bracket.ts`
- Colour tokens: `src/index.css` (`--round-*`, `--rr-g*`, `--matrix-final*`)

---

## 1. Shared viewer shell (all dense views)

Every matrix, grid, bracket and round track renders inside
`TournamentInteractiveViewer`:

- Inline rounded frame (`inlineHeight` px) plus a full-screen **Expand** dialog
  (portal, Escape closes, focus managed).
- Toolbar: Zoom out, zoom %, Zoom in, **Width** (fit width), **Fit** (fit screen),
  100%, Reset, optional extras, Expand/Close. `compactMobileToolbar` collapses
  labelled buttons to icons on phones (stacked pool panels only).
- Zoom 0.25–3×: mouse wheel (pointer-anchored; `wheelZoom="direct"` zooms on plain
  wheel, `"modifier"` needs Ctrl/Cmd), trackpad pinch, buttons. At a zoom bound the
  wheel event is NOT cancelled, so page scrolling continues.
- Drag to pan (pointer-captured mouse drag; native touch scroll). Panning excludes
  `input/select/textarea/button` — interactive controls are never grabbed.
- Keyboard on the frame: `+`/`-` zoom, `0` reset, `F` fit, arrows pan.
- The shell never fetches or writes; views pass ready-made children.

---

## 2. Round-robin template

### 2.1 Tabs
`Fixtures & standings` | `Calendar View` (2-button tab bar, solid `bg-primary`
selected state). Calendar is read-only: solid blocks = saved fixtures; play-by
rounds show their deadline day; all tournament categories visible, the selected
category highlighted green.

### 2.2 Clean view (`RoundRobinCleanView`) — default for every club
1. **Standings panel** (own bordered section, above the viewer):
   - Heading `Standings — live` (or `— final`).
   - Fixed caption: `"Pos." is the fixed draw position and never moves; Rank
     updates with each result.`
   - Columns: **Rank | Pos. | Player | P | W | L | Games | GD | Pts F/A**.
   - Rank shows `—` until any result is played. Rows carry the pool colour band
     (`riverside-rr-band`, `data-rr-group`).
2. **Round track** (horizontal, draggable, inside the viewer): one panel per round,
   320 px wide, self-start. Header: `{Group label} · {Round label}` + status pill
   (Complete / In progress / Not started) with a coloured dot; `Bye: names` line
   when players sit out.
   - Column headers: **Pos | Player | Day & time · court | Result** — the same
     table format as the Swiss round panels, reusing `WhenTag`.
   - Each match is a 2-row block (one row per player) separated by a 3 px top
     border; an inset 3 px left bar is green when played/bye, round-tone otherwise.
   - Winner row: light-green fill + semibold; loser muted. Score on the winner row.
   - `WhenTag` kinds: saved date/time (muted solid), `Play by …` (amber border),
     `Proposed …` (dashed), Not scheduled/TBD (plain muted). An "After play-by
     deadline" warning appears under a date that passes the saved deadline.
3. Mobile: compact viewer toolbar, `fit width` default; two-pool categories must
   keep both pools discoverable together without empty frame space.

### 2.3 Combined pools (`RoundRobinCombinedCleanView`)
- ONE standings table for all pools: extra leading **Pool** column (rowspan per
  pool), rows colour-banded per pool.
- ONE round table per round for all pools: each pool's matches appear under a
  pool-label divider row inside the shared round panel — never separate tables
  per pool.
- Round status is derived across pools (complete only when every pool's round is
  complete).

### 2.4 Classic matrix view (fallback / matrix-only mode)
- Square matrix: `# | Player | 1..N | W | L | GF | GA | GD | Pts F/A | Rank`.
- Completed cells show only the row-perspective game score (`3–1` mirrored as
  `1–3`), light-green fill (`--matrix-final`) with dark text on both mirrored
  cells. Live cells get a red border; pending cells show the round reference
  (`R{n}`) in the round tone. Individual rally points stay in fixture details.
- **Pts F/A** = total recorded rally points from confirmed completed pool matches
  only (mirrored for both players); never games won/lost, live points or
  bye/walkover awards. Shows `—` when point detail is incomplete.
- `Final standing` table (Rank / Player / W-L) appears once the pool is complete.
- Order-of-play panels below use the same round-panel format as 2.2.

### 2.5 Standings rules (RR)
- Pos = fixed draw position, immutable; Rank = live, updates per result, computed
  per pool by saved scoring/tiebreak rules (pure logic in
  `src/lib/tournaments/round-robin-view.ts`).
- Before any results, the palette stays soft and order is labelled provisional
  draw/seed order, not earned ranking.

---

## 3. Swiss template

### 3.1 Tabs (`SwissProgressionPilotView`)
`Grid` (or `Positional Preview`) | `Log View` | `Calendar View` — solid
full-width buttons, saturated selected state. A `Pilot · read-only view` badge
plus the format note sits under the tabs; a green **Completed** banner appears
when all configured rounds are played.

### 3.2 Grid view (`SwissPositionGrid`) — default
- Rounds as side-by-side panels (min 320 px), horizontally draggable inside the
  viewer; one table per round with header `Round {n}` + status pill:
  Completed (green) / In progress (amber) / Upcoming (round tone) /
  Players TBD (muted).
- Column headers: **Pos | Player | Day & time · court | Result**.
- Each match is one 2-row block (never one row per position); winner row
  light-green + semibold, loser muted; score on the top row. `WhenTag` +
  court under it.
- Pending slots show position numbers with `TBD` names; names appear once the
  deciding game is complete. Projected names (from a confirmed result) carry a
  small `projected` tag.
- Tap a player's name to highlight their known path (`bg-primary/20` outline);
  future rounds stay TBD. `Clear highlight` resets.
- **Final standings card** at the end of the track (green top border):
  `Current positions` (pill: Projected) until the Swiss stage's own rounds are
  complete, then `Final standings` (pill: Locked) — later follow-up stage games
  do not block the lock.
- Hybrid Swiss/RR: from Round 3 rows carry the pool band; locked groups show a
  `Locked` chip; the Swiss remainder band is dashed/neutral.

### 3.3 Positional Preview mode
- Heading: `PREVIEW · Proposed fixed-position Swiss · {N} entrants · {R} rounds`.
- Each round header states its factuality: `Real games · results as played`,
  `Real games shown · remaining slots still to be decided`, or
  `Proposed slots · not live fixtures`; a schedule line shows the round-level
  plan (play-by date or window) when set.
- Preview pairings never create bookings, fixtures or notifications.

### 3.4 Log View (classic tables)
- Progression table: **Pos | Move | Player | Seed | (Pairing pos. | Group when
  locked) | Round 1..n | Current positions / Final standings**. Move shows
  `▲n` / `▼n` / `–`. Result cells `W`/`L` prefixed, with the position after each
  round. Final column is green + semibold once complete.
- Rounds tables per round: **Match | Winner | Loser | Score | Date / time |
  Court | Play by | Status** (Played / To play / Opponent to be decided / Bye);
  rounds not yet drawn show `Opponents to be decided once round {n-1} is
  finished.`
- `SwissCurrentPositionsTable` (Results tab): Pos | Player | R1..Rn result |
  Current/Final positions.
- Final ranking after {n} rounds (bordered green card): Pos | Player | Group |
  RR wins — group 1 rows green, group 2 amber (`rr-final-ranking.ts`).
- Hybrid Swiss/RR standings (`SwissRrFinishStandings`): one table per locked
  group — heading `Group {n} · positions lo–hi · played/total`; columns
  **Rank | Pos. | Player | P | W | L | Games | GD | Pts F/A**; rank runs 1–N
  across groups (Group 2 ranks from 5, etc.), ties marked `=`; only Round
  {fromRound}+ group games count. Powered by the shared `hybridSwissTable`:
  RR pairing labels freeze at the lock round, remainder rankings stay inside
  their cohort, later RR results never change Swiss tie-breaks.

### 3.5 Calendar view
Read-only, grouped by day: `Saved fixture` (solid), `Proposed slot · not booked`
(dashed), `Play by` (deadline day), `Not scheduled` count line. All categories
visible; selected category green.

### 3.6 Swiss data rules
- Model built in `src/lib/tournaments/swiss-progression-view.ts`; standings via
  `hybridSwissTable` (`swiss-rr-finish.ts`). Never recreate pairing or ranking
  rules in pages.
- Approved fixed-position models (16 = halves of 8, 18 = top 10/bottom 8,
  24 = halves of 12) and final-round adjacency preference live in memory and the
  pairing optimizer; no actual-opponent repeats; saved games never change.

---

## 4. Play-off templates

### 4.1 Planned play-off bracket (`PlannedPlayoffBracketView`) — preferred
- Layout inside the shared viewer: **Pool standings column → stage columns
  (Quarterfinals / Semi-finals / Final) → Winner card**.
- Pool standings cards: coloured header per pool, ordinal chips (1st, 2nd, …);
  qualifiers bold with pool-tone chips, non-qualifiers dimmed. Pool tones cycle
  primary → warning → success → accent by pool letter.
- Game cards: id + when in the header, two side rows separated by a divider;
  side chip shows pool + rank (`A1`), name or positional placeholder
  (`A1 1st v A2 2nd`). Final column card has an amber border and 🏆.
- Winner card: `🏆 {champion}` in amber when decided, dashed `Winner {Final id}`
  otherwise.
- Connector lines: smooth curves measured from the rendered layout (survive
  zoom), pool-coloured from pool slots, primary between games; **dashed until
  the bracket is confirmed**, solid after.
- Display-only; placeholders never become real names before qualification is
  confirmed; group stages are never converted to knockout.

### 4.2 Classic knockout bracket (`KnockoutBracketView`)
- Seeds down the left, winners flow right; round headers
  `Quarterfinals / Semi-finals / Final` (or `Last N`). Boxes show seed (first
  round only), name, strike-through loser, score line, date · time · court.
- Future rounds render as dashed empty boxes labelled `Winner of previous match`;
  a `Winner` card follows the final; optional 3rd/4th-place box below.
- Split draws show `Top half` / `Bottom half` labels with a winner per half.

### 4.3 Grouped progression block (`ParentCategoryProgression`)
- One block for subcategories/pools that feed a shared playoff:
  `Progression` | `Log View` tabs; each child keeps its own rankings and results
  stacked inside one bordered block (label + format badge + provisional/rankings
  status note).
- Shared playoffs section beside/below: stage columns with saved fixtures or
  dashed positional placeholders (`A1 1st v A2 2nd`, cross-pool seeding,
  `Winner M1 v Winner M2`), plus an unmatched-fixtures list.
- Right rail: sticky `Upcoming games` summary (child · round · when).
- Strictly a spectator view: no action callbacks or data hooks.

---

## 5. Shared visual language (frozen)

| Token | Value (light / dark) | Use |
|---|---|---|
| `--round-1` | 214 80% 48% / 62% | Round 1 accent, pending/upcoming status |
| `--round-2` | 178 65% 34% / 48% | Round 2 accent |
| `--round-3` | 262 50% 55% / 68% | Round 3 accent |
| `--round-4` | 36 90% 44% / 56% | Round 4 accent |
| `--round-5` | 145 55% 36% / 50% | Round 5 accent (cycles mod 5) |
| `--rr-g1..g4` | 145 55% 40% · 45 90% 48% · 212 75% 52% · 270 55% 58% | Pool bands 1–4 (5 → round-5, 6 → accent, swiss → muted dashed) |
| `--matrix-final` | 145 31% 80% / 76% on dark text | Completed RR matrix cells |
| `--success` / `--warning` | theme | Complete / in-progress status, winner rows, final lock |

- Round accents are restrained: header top border, thin panel border and status
  pill only — never colour on every cell.
- Status pills everywhere: coloured dot + label on a 15%-tinted chip.
- Pool band = 14% tint background + 3 px left border in the pool tone; the Swiss
  remainder uses a dashed muted border.
- Category selection tabs are solid rectangular blue/teal/purple-accented
  buttons with a saturated selected state — never small pills.
- 13 px dense tables, `tabular-nums` for numbers, dark-theme score legibility in
  both themes.

## 6. Invariants (do not break)

1. Display-only: no writes, bookings, notices or regeneration from any view.
2. Pos never moves; Rank is live and follows saved scoring/tiebreak rules.
3. Round/stage headings appear only when the admin set up rounds (play-by dates,
   real labels or self-scheduled); pre-planned timed events render one flat
   chronological schedule.
4. Proposed/projected content is always labelled (PREVIEW, proposed, projected,
   dashed) and separated from factual saved games.
5. The dense views render inside `TournamentInteractiveViewer`; drag/zoom are
   navigation only and never mutate data or intercept standings actions.
6. Existing Uitsig approved exact display charts and the Riverside pilot gating
   (`club_beta_features`, set from Super Admin) remain separate exceptions.
