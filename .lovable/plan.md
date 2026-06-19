
# Ranking Points System (parallel to Pyramid Ladder)

## Goals
- Keep the existing pyramid `ladder_position` exactly as-is.
- Add a second, parallel **Ranking Points** leaderboard per club, ATP-style.
- Every official result that "counts for rankings" creates a **pending delta** that admin must approve before it moves anyone's points.
- Tournament & league creators explicitly tick **"Affects official ranking?"** at setup time.
- No decay — points are permanent (per user decision).

---

## 1. Settings & opt-in

**Club setting** (in association rules / club settings):
- `ranking_points_enabled` (bool, default false)
- `points_base_win` (default `0.25`)
- `points_upset_bonus_per_rank` (default `0.10`) — bonus per rank-gap when underdog wins
- `points_favourite_win_min` (default `0.10`) — floor when a much higher-ranked player wins a lower one
- `points_loser_deduction` (default `0`) — losers don't lose points unless club enables

Admin can change these from a new **Ranking Points** tab in Club Admin → Settings.

---

## 2. Seeding (one-time per club, when enabled)

**Linear from current ladder:**
- `#1 = 1000`, decrement by `10` per ladder position (configurable).
- Members with no `ladder_position` start at `500`.
- One-click "Seed from ladder" action in admin settings; writes initial balance + an audit row showing it was a seed.

---

## 3. Match flow

### "Affects official ranking?" toggle added to:
- Club tournament create/edit (`club_champs`)
- Internal league create/edit (`leagues` / `league_rounds`)
- Challenge "Make official" toggle (already partly modelled)
- Manual match entry (`AddMatchResult`)

External NSA league fixtures are **not** included — those run on their own system.

### When a result is recorded on a ranking-affecting match:
1. Compute proposed delta using the formula (see Technical).
2. Insert a row into `ranking_points_pending` with status `pending`.
3. Notify club admin (in-app notification).
4. Nothing on the leaderboard moves yet.

### Admin approval queue (new page: Club Admin → Ranking Points → Pending):
- List of pending deltas with: match context (tournament/league/challenge), players, current points, proposed change.
- Bulk approve / reject / edit-then-approve.
- On approve → insert into `ranking_points_ledger`, update `club_members.ranking_points`.
- On reject → row marked rejected with admin note.

---

## 4. Display

- New **"Ranking Points"** tab next to Ladder on the club Ladder page.
- Same row styling (rank tint), columns: Rank, Player, Points, Matches counted, Last movement.
- Player profile gets a "Points history" section showing each approved delta + reason.

---

## 5. Technical notes (for builder)

### New tables (migration)
- `ranking_points_pending` — `club_id`, `match_source_type` (`tournament`|`league`|`challenge`|`manual`), `match_source_id`, `winner_member_id`, `loser_member_id`, `winner_delta`, `loser_delta`, `status` (`pending`|`approved`|`rejected`), `reviewed_by`, `review_note`, timestamps.
- `ranking_points_ledger` — append-only history of approved movements (member_id, delta, reason, source ref, balance_after).
- New column `club_members.ranking_points` (numeric, default 0).
- All scoped by `club_id`; RLS + GRANT per project rules.

### Formula (default, configurable)
```text
gap = loser_current_rank_position - winner_current_rank_position
if gap > 0  (underdog won):
    winner_delta = base_win + upset_bonus_per_rank * gap
    loser_delta  = -loser_deduction (default 0)
else  (favourite won):
    winner_delta = max(base_win + 0.05 * gap, favourite_win_min)
    loser_delta  = 0
```
Rank position = position on the **Ranking Points leaderboard** at time of match (not pyramid ladder), so the system self-stabilises.

### Hook-in points (existing code)
- `src/pages/AddMatchResult.tsx` — add "Affects ranking?" checkbox; on submit call helper to enqueue pending delta.
- Challenge confirm flow — same enqueue when challenge is marked official.
- Tournament match completion (`club_champs_matches`) — enqueue if tournament `affects_ranking = true`.
- League result (`league_match_results` for internal leagues only) — enqueue if league `affects_ranking = true`.

### New UI
- `src/pages/admin/RankingPointsAdmin.tsx` — settings + pending queue + seed button.
- `src/components/ladder/RankingPointsTab.tsx` — leaderboard view.
- Player profile section: approved history list.

### Out of scope (for this phase)
- Decay (explicitly not wanted).
- Cross-club ranking.
- Auto-applying to external NSA fixtures.

---

## 6. Rollout order

1. Migration: tables, columns, RLS, grants.
2. Settings UI + seed-from-ladder action.
3. "Affects ranking?" toggles on tournament/league/challenge/manual entry.
4. Pending-delta enqueue helpers + writes from each match source.
5. Admin approval queue.
6. Ranking Points leaderboard tab + player history section.
7. Test end-to-end with Highveld test club.
