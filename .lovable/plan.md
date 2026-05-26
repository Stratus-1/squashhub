# Fix concurrent marking + add explicit "View Game" mode

## Root cause of CSI006 / PCC008 "arrow vanished at 7‑3"

Self-inflicted bug in `LeagueGameDetail.tsx`, not a multi-user collision:

1. `onLiveScore` (line 1744) debounce-writes the **in-progress** game into `game_scores` (e.g. `{home:7, away:3}`).
2. Realtime fires → refetch handler (line 540‑558) counts every `home>away` row as a **won** game → `matchDecided=true` → `completed=true`.
3. Marker arrow is gated on `!pos.completed` (line 2426) → **arrow disappears, captain stuck**.

Two captains marking at once amplifies this: `handleSubmit`/`handleSwap` re-upsert every position from local state, wiping live scores.

## Live sync — does it still work?

**Yes, the realtime channel still fires** (line 366‑387 subscribes to `league_match_results` and `league_fixture_results`). Viewers' `existingMatches` query is invalidated on every change. What "broke" the feel of live sync:

- Scores get written but the row sometimes flips to `completed=true` mid-game (bug above), so on a viewer's screen the game looks finished prematurely.
- There is no dedicated "viewer" mode — non-captains land on the same scorecard with no clue it's updating live. No "LIVE" badge, no marker presence indicator.

The fixes below restore real live-follow and make it visible.

## Plan

### 1. Split in-progress vs finished games (kills the 7‑3 bug)
- Add `current_game jsonb` to `league_match_results` (`{home, away}` or null).
- `game_scores` stores **only completed games**.
- `onLiveScore` → write `current_game` only.
- `onProgress` → append to `game_scores`, clear `current_game`.
- Refetch never counts `current_game` toward `matchDecided`.

### 2. Server-authoritative `completed`
Drop the client `home>away` recompute. A position is `completed` only when the DB row has an explicit `winner` ('home'/'away') or `is_forfeit=true`. Keeps the marker arrow visible until the rubber is truly over.

### 3. Stop bulk overwrites
- `handleSubmit` & `handleSwap` upsert only positions whose **setup fields** (player code/name) changed.
- Never include `game_scores`, `home_games_won`, `away_games_won`, `winner`, `is_forfeit` in setup-only writes.

### 4. Soft marker lock — one marker, many viewers (with takeover)
New table `league_marker_locks` (`fixture_id`, `position`, `user_id`, `user_name`, `heartbeat_at`, unique on `fixture_id,position`).

- Marker view sends a heartbeat every 20 s and releases on exit.
- Lock fresh (< 60 s) and not mine → marker arrow swapped for **"Marking: {name}"** badge + **"Take over"** link.
- Lock stale → silent reclaim.
- Lock added to `supabase_realtime` publication so badge updates instantly for all viewers.

### 5. Explicit "View Game" button (new)
Today everyone lands on the same scorecard with no clear live-spectator mode. Add an explicit second action.

**Where the buttons live**

- **League Games list** (`LeagueGames.tsx`) — for every fixture row, replace the single "Open" button with two:
  - `▶ Mark` — visible only to captains/admins with edit rights. Opens the scorecard in **mark mode**.
  - `👁 View Game` — visible to everyone in the club. Opens the scorecard in **read-only live mode**.
- **League Game Detail header** — same pair of buttons in the top bar so a captain who entered as a viewer can switch to marking (and vice versa) without going back.
- **Inside the scorecard table** — keep the per-position mark arrow (existing UX), but only render it in mark mode AND when no other captain holds the position lock.

**View mode behaviour** (`?mode=view` or default for non-captains)

- Pulls the same realtime channel — scores tick over as the marker scores points (driven by `current_game` + `game_scores`).
- Shows a pulsing **🔴 LIVE** badge whenever any position has a `current_game` or a fresh marker lock.
- Shows the marker presence chip: *"🎙 {Captain Name} marking pos 3 · last activity 4s ago."*
- All edit controls hidden: no swap, no clear, no manual entry, no submit, no setup save, no NSA-post button. Forfeit/score cells become plain read-only text.
- Quick stat strip at top: home games · away games · projected points · who's leading.

**Mark mode** (today's behaviour, cleaned up)

- Captains/admins. All current controls remain. The position-level "Mark" arrow respects the soft lock from §4.

### 6. Don't auto-flip to `'submitted'` mid-session
Only mark status `'submitted'` when both signatures present, explicit admin override, **or** every playable position has a `winner`. Removes the past-date-fixture auto-submit path that can lock the other captain out.

### 7. Small UX
- Arrow visible whenever `pos.scores.length > 0 && !pos.winner && !pos.isForfeit` (covers your "arrow stays until match is over").
- Toast for viewers: *"{Name} took over marking position {N}"* when the lock changes.
- Reuse this `?mode=view` URL for shareable spectator links.

## Technical notes

- Files touched:
  - `src/pages/LeagueGameDetail.tsx` (refetch mapping, handleSubmit/handleSwap diff-only, marker view, lock dialog, view-mode gating, LIVE badge).
  - `src/pages/LeagueGames.tsx` (twin `Mark` / `View Game` buttons).
  - `src/components/marker/MarkerScoreboard.tsx` (split `onLiveScore` payload to `current_game`).
  - One migration: `current_game` column + `league_marker_locks` table with club-scoped RLS + add both to `supabase_realtime` publication.
- No changes to points math or NSA submission.
- Backwards-compatible: existing rows are healed on the next save; absent `current_game` is treated as null.

## Out of scope

- Per-character collaborative editing.
- Public unauthenticated spectator URL (view mode still requires club login for now).
- Changing who can sign / submit a fixture.
