# Plan only: shared tournament viewer and four tournament views

Nothing gets built until you approve it. Everything is Riverside-only, each piece behind its own switch, and nothing is published.

## 1. Shared viewer: `TournamentInteractiveViewer`
- One display wrapper. It never reads or writes tournament data.
- Normal mode: fits inside the page, with an "Expand" button.
- Expanded / fullscreen mode: a full-screen overlay (browser fullscreen where the device supports it). Esc or a close button returns to the page.
- Controls: zoom in, zoom out, zoom %, fit width, fit screen, reset.
- Desktop: drag or scroll to move around, Ctrl + mouse wheel to zoom.
- Phones and tablets: pinch to zoom and drag with one finger.
- Optional sticky header row and first column, for tables and matrices.
- Remembers zoom per view, per device.
- Works in both light and dark themes and is keyboard accessible.
- Open choice: write our own small zoom/pan layer, or use a small library. Needs your confirmation.

## 2. Views inside the shared viewer (each with its own switch)
A. **Pool matrix + order of play.** A players-by-players score grid plus the match schedule. Uses the existing standings.
B. **Swiss progression standings.** One column per round, the movement since the last round, and withdrawn players greyed out. This is display only and uses the current shared Swiss ranking. The fixed SportyHQ position-map format is a separate decision and is not decided yet.
C. **Knockout / Monrad draw bracket.** Uses the existing bracket positions. Match labels (A9, E5) are display only.
D. **Calendar / court schedule board.** Courts against time. Read-only first; dragging matches to new times for admins comes in a later phase that needs your approval, with an impact preview and booking checks.

## 3. Switches (separate per view, Riverside only)
- `tournament_viewer_shell`, `tournament_pool_matrix_view`, `tournament_swiss_progression_view`, `tournament_bracket_view`, `tournament_schedule_board`.
- Riverside is switched on through an admin data step, never inside a database structure change. Turning a switch off falls back to today's views.

## 4. Phases
1. Shared viewer only, tested with a test page full of dense dummy content. Desktop and mobile gesture tests.
2. View B, after sign-off.
3. View A.
4. View C.
5. View D read-only, then drag scheduling (separate approval).
Each phase: unit tests, synthetic Riverside test data, your sign-off, then a staged rollout.

## Decisions needed from you
- Which view comes first after the shared viewer?
- Library or our own zoom/pan layer?
- Who can see expanded views: admins only, or players too?
