# Plan only: Tournament Interactive Viewer and four Riverside-only views

Nothing is built, migrated or published until you approve a phase.

## Current state (checked)
- The Swiss progression work has been reverted.
- Riverside switches: the club now has no viewer or view switches; only `tournament_beta` and `ai_actions` rows exist.
- Allowed switch names: the backend still accepts `tournament_swiss_progression_view`, `tournament_pool_matrix_view` and `tournament_bracket_view`, left over from the reverted change. It does not yet accept `tournament_viewer_shell` or `tournament_schedule_board`.
- How switches work today: the existing pattern is a `club_beta_features` row per club and feature. It is read by a hook that fails closed (`use-tournament-beta.ts`) and switched on or off from a Super Admin card (`TournamentBetaClubsCard.tsx`).
- Tools on hand: no pan/zoom library is installed.

## 1. `TournamentInteractiveViewer` architecture

**What the wrapper does:** frame, toolbar, zoom and pan, fit modes, expanded or fullscreen mode, and remembering zoom. It never fetches, ranks or writes tournament data. Each view gets ready-made rows as props and stays a plain component that can be tested on its own.

**Settings each view passes in:**
```text
<TournamentInteractiveViewer
  id="swiss-progression:<champId>:<division>"   // key for remembering zoom
  title="Men's A - Progression"
  contentSize?={{ width, height }}               // optional fixed size
  minZoom=0.25 maxZoom=3 defaultFit="width"|"screen"|"none"
  stickyHeader? stickyFirstColumn?               // tables only
  toolbarExtras?={ReactNode}                     // e.g. a classic/progression switch
  printable?=true
>
  {view}
</TournamentInteractiveViewer>
```

**Content size:** a view either declares its natural size (bracket, schedule board, since these are laid out on a grid) or the wrapper measures it. Measuring renders the content once at 100% zoom and watches for size changes. Fit is worked out from that size, never from the shrunk or enlarged copy, so fit never jumps around.

**Desktop**
- An inline frame with a set height, plus an Expand button.
- Expanded mode is a full-screen overlay. It uses browser fullscreen where available, otherwise it fills the window.
- Esc closes. Focus is kept inside while it is open and returns to the Expand button afterwards.
- Ctrl/⌘ + mouse wheel or a trackpad pinch zooms around the pointer. A plain wheel scrolls. Space + drag or a middle-mouse drag pans.

**Phones and tablets**
- Two-finger pinch zooms around the midpoint between the fingers. One finger drags inside expanded mode.
- Inline, one-finger swipes still scroll the page, so the page never gets stuck. Pinch inline offers to open expanded mode.
- Double-tap toggles between "fit" and 100%.

**Fit options**
- Fit width: zoom = frame width / content width.
- Fit screen: the smaller of the width and height ratios.
- Reset: back to the default fit. 100% is a separate button.
- All fit and reset changes zoom around the centre of the frame.

**Accessibility**
- Toolbar buttons with labels. `+`, `-`, `0` (reset), `F` (fit) and arrow-key panning work when the frame has focus.
- Zoom % is announced to screen readers. Content stays real text and tables, not images, so screen readers can read it.
- Gestures are kept to a minimum when the device asks for reduced motion.
- Works in both themes. Tournament admin pages stay light-only, as now.

**Print and export**
- Printing ignores zoom and pan and prints the full content at its natural size, landscape, split across pages for tables.
- Export to PNG or PDF is a later, optional step. It could reuse the measured content size and needs no data changes.

## 2. Library or our own: ranked

1. **`react-zoom-pan-pinch`** (recommended)
   - Mature and built for React; handles pinch, momentum, pointer-anchored zoom and the touch quirks of iPhones and iPads.
   - Small, roughly 10 KB once compressed.
   - It already has the fit, centre and reset functions we need, and fits with React 18 and Tailwind.
   - The risks are small: it limits how sticky headers can work, which we'd solve by drawing a separate header strip in sync, and it adds one outside library.
2. **`@panzoom/panzoom`**
   - Very small and doesn't depend on React.
   - It needs more of our own wiring for React and for fit modes, and its touch handling is less complete.
3. **Our own layer** (Pointer Events + CSS transform)
   - No new library, and full control over sticky headers.
   - Highest risk: getting trackpad, wheel and pinch to feel right across Safari and Android takes a lot of testing, and we'd maintain it forever.
4. **`d3-zoom`**
   - Excellent for drawn graphics, but a poor fit for HTML tables and adds d3 conventions we don't use elsewhere.

The library would sit behind our own wrapper, so it can be swapped later without touching any view.

## 3. Switches

- **Five separate switches:** `tournament_viewer_shell`, `tournament_pool_matrix_view`, `tournament_swiss_progression_view`, `tournament_bracket_view`, `tournament_schedule_board`.
- **Rule:** a view shows only when its own switch **and** the viewer switch are on. Otherwise the current view renders unchanged.
- **Database change:** one structure-only change to add the two missing names to the allowed list. No club rows are added in it. The three leftover names stay valid.
- **Switching on:** a Super Admin "Tournament views pilot" card, a generalised version of `TournamentBetaClubsCard`, with one toggle per switch per club. Riverside is switched on by clicking it, not by code.
- **Safety:**
  - Only Super Admins can change switches; that's already enforced by backend access rules, which we'd re-check before building.
  - Switching off deletes no data.
  - Unknown or failed lookups count as OFF.
  - A shared `useClubBetaFeature(clubId, key)` hook replaces one-off checks.
- **Player visibility (optional, later):** a per-switch setting, "admins only" (the default) or "everyone at this club". This would need a small additional field and your decision.

## 4. Views

### A. Pool matrix + order of play
- **Data it needs:** division entrants, pool membership, fixtures with scores, and the court, time and status of each match. All of this already exists and is used by the current standings.
- **Gaps:**
  - The grid layout for each pool.
  - Showing best-of-3 or best-of-5 scores in a cell.
  - Order of play grouped by time or court.
  - Who wins head-to-head ties stays with the existing standings rules.
- **Database change risk:** none.
- **Tests:**
  - Pure "build the grid" checks: correct size per pool, the mirrored cell is the flipped score, and no cell for a player against themselves.
  - Saved-snapshot checks with made-up 4, 5, 6 and 8-player pools.
  - Screenshot comparison against your reference image.
- **Decisions needed from you:**
  - Should cells show games (3-1) or the full points per game?
  - Should the order of play be one list or grouped per court?

### B. Swiss progression standings
- **Data it needs:** Swiss fixtures by round, the shared Swiss ranking (`swissTable`), and withdrawn status.
- **Gaps:** only the display (round columns, movement since last round).
- **Big open question:** whether to show the current Swiss rules or the SportyHQ fixed position-map format. That format is a separate engine change and is not approved.
- **Database change risk:** none for display. High if the SportyHQ format is approved, because that needs new fields to store fixture positions.
- **Tests:** replay checks against `swissTable`, bye and withdrawal cases, and a comparison with your 12/14/18 screenshots.
- **Decisions needed from you:**
  - Current Swiss or position-map format?
  - How a bye shows.
  - Whether withdrawn players stay at the bottom.

### C. Knockout / Monrad bracket
- **Data it needs:** `bracket_position` (already in use: draw board, knockout tests), the seeded order, and winner progression.
- **Gaps:**
  - The bracket layout itself (columns per round and connector lines).
  - Placement brackets for Monrad.
  - Display-only labels such as A9 or E5.
- **Database change risk:** none for knockout display. A real Monrad engine (the matches for every placing) would be a separate engine change and needs its own approval.
- **Tests:**
  - Layout checks for 4, 8, 16, 32 draws, and 12 with byes.
  - Connector lines line up.
  - Snapshot comparison against the SportyHQ screenshots.
- **Decisions needed from you:**
  - Main draw only, or all placings?
  - Your labelling scheme.

### D. Calendar / court schedule board
- **Data it needs:** fixture date, time and court, court bookings, Club Champs holds, and the club's slot length.
- **Gaps:**
  - Courts-by-time layout that handles more than one day.
  - Showing booking clashes.
- **Admin drag-and-drop scheduling (later, high risk):**
  - It touches bookings, holds and their automatic release, reflow, lights, access and notifications.
  - It must reuse the existing booking checks.
  - It needs an impact preview and confirmation, with no automatic messages.
- **Database change risk:** none for the read-only board. Drag scheduling probably needs no new tables, but every save path needs review.
- **Tests:**
  - Read-only board checks against real-shaped bookings.
  - Drag scheduling later: conflict, hold and booking tests, plus a Riverside end-to-end run.
- **Decisions needed from you:**
  - Read-only first?
  - Who may drag matches?
  - Should a move send a notice, and if so after an explicit confirm?

## 5. Recommended order
1. **Viewer shell**, behind its own switch, tested on a Super Admin test page full of dummy dense content and on real devices.
2. **View A: pool matrix.** I recommend this first: no database change, no engine questions, the data already exists, and it is the easiest test of zoom, fit and sticky headers.
3. **View C: knockout bracket.** Display only, using existing positions.
4. **View B: Swiss progression.** Only after you decide between current Swiss and the position-map format.
5. **View D: schedule board, read-only.** Drag scheduling follows as a separately approved phase.

## 6. Rollout
- **Riverside test data first:** a synthetic Riverside tournament with made-up players for each view (8, 12, 14, 18, 24, 32, including odd counts). No real notices, bookings or fees. The live Riverside Club Champs is never altered.
- **Visibility:** admins only first, then optionally players at Riverside after your sign-off, then other clubs one at a time.
- **Protecting Uitsig and current views:**
  - Existing views are never edited, only wrapped behind the switches.
  - Uitsig has no switches.
  - Every view has a "Classic view" fallback.
  - Each phase runs the existing tournament tests unchanged.
- **Checks before rollout:**
  - Automated browser checks at desktop (1280px), tablet (768px) and phone (390px) sizes, covering fit, zoom, pan, expand/Esc and print preview.
  - Hands-on checks on an iPhone (Safari), an Android phone (Chrome) and the installed app.
  - Your sign-off per view before widening.

## Decisions needed before Phase 1
- Approve the `react-zoom-pan-pinch` library (or our own layer).
- Approve the one structure-only change to add the two missing switch names.
- Confirm the viewer starts admins-only.
- Confirm pool matrix as the first view.
