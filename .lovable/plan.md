## Goal

1. Finish what's already in flight: surface NSA penalties on fixtures + warn captains before submission.
2. New: give Super Admin two new tabs **per league** — **Penalties** and **Rules** — and make the **Rules** drive what the match marker is allowed to do.

---

## Part A — NSA penalties (finish in-flight work)

1. **`<NsaPenaltyBadge fixtureId={...} teamSide="home|away" />`**
   - Uses `useNsaFixturePenalties` (already added).
   - Renders red badge `−2 pts · SSA Unpaid` with tooltip listing all reasons.
2. Insert badge into:
   - `LeagueGameDetail` (under each team total).
   - Captain standings row (⚠ icon, hover = breakdown).
3. **Pre-submit warnings panel** in `NsaSubmitDialog`:
   - Forfeit / walkover detected → warn.
   - Player promoted >2 leagues from registered league → warn.
   - Missing marker NSF → warn.
   - Soft warnings only — captain can still submit.

---

## Part B — Per-league **Penalties** tab (Super Admin)

Read-only view of all penalties NSA has applied to any team in this league.

- Source: scrape every completed fixture in the league via `nsa-proxy?endpoint=fixture_penalties` and cache in a new table.
- Columns: Fixture date · Team · Points · Reason · Round.
- Filter: by team, by reason, by round.

## Part C — Per-league **Rules** tab (Super Admin) ← the new heart of this request

A per-league configurable rule set that the **match marker** consumes.

### Rule fields (v1)

| Field | Example | Used by marker |
|---|---|---|
| `points_per_game` | 11 / 15 | Locks game-end at this score |
| `win_by` | 2 | Game cannot end unless lead ≥ this |
| `games_format` | best_of_3 / best_of_5 | Match ends when a side wins (n/2)+1 |
| `tiebreak_at` | 10–10 / 14–14 | Triggers "win by 2" overtime |
| `let_stroke_enabled` | true/false | Show/hide let & stroke buttons |
| `max_timeouts_per_player` | 1 | Disable timeout button after limit |
| `marker_required` | true | Block submission if no qualified marker selected |
| `marker_must_be_qualified` | true | Marker dropdown filters to qualified only |
| `forfeit_allowed` | true | Show/hide forfeit option |
| `notes` | free text | Shown to marker as info banner |

Defaults per league type (Men/Ladies/Mixed) seeded automatically; super admin can override per league.

### Marker enforcement

In `MatchMarkerModule` (live scoring) and the post-game scorecard:
- Read rules via new `useLeagueRules(leagueId)` hook.
- Replace today's hard-coded "11 win by 2 best of 5" with values from rules.
- Disable/hide UI controls that the rules forbid (e.g., let button, timeout button).
- Prevent saving a game whose final score violates `points_per_game` / `win_by`.
- Prevent marking match complete unless `games_format` reached.

---

## Database

New tables (migration):

```text
league_rules
  id, league_id (unique), club_id,
  points_per_game int default 11,
  win_by int default 2,
  games_format text default 'best_of_5',  -- best_of_3 | best_of_5
  tiebreak_at int,                         -- nullable
  let_stroke_enabled bool default true,
  max_timeouts_per_player int default 1,
  marker_required bool default true,
  marker_must_be_qualified bool default true,
  forfeit_allowed bool default true,
  notes text,
  created_at, updated_at

league_fixture_penalties
  id, fixture_id (nsa fixture id), league_id, club_id,
  team_side text,         -- 'home' | 'away'
  team_name text,
  nsa_team_id int,
  penalty_points int,
  reasons jsonb,          -- array of {label, points}
  scraped_at timestamptz
  unique(fixture_id, team_side)
```

RLS:
- `league_rules`: read = any club_member of the club; write = club admin OR super admin.
- `league_fixture_penalties`: read = any club_member of the club; write = service role only (edge fn).

Trigger: when a new league row is created, auto-insert default `league_rules` row.

---

## Files to touch

**New**
- `src/components/nsa/NsaPenaltyBadge.tsx`
- `src/components/super-admin/league/PenaltiesTab.tsx`
- `src/components/super-admin/league/RulesTab.tsx`
- `src/hooks/use-league-rules.ts`
- `supabase/functions/sync-league-penalties/index.ts` (cron-able: scrape + upsert)

**Edit**
- `src/components/super-admin/LeagueDetailDialog.tsx` (or equivalent) — add Penalties + Rules tabs.
- `src/components/league/LeagueGameDetail.tsx` — render `<NsaPenaltyBadge>`.
- `src/components/league/NsaSubmitDialog.tsx` — pre-submit warnings panel.
- `src/components/match/MatchMarkerModule.tsx` — consume rules.
- `src/components/league/Scorecard*.tsx` — consume rules.

---

## Rollout order

1. Migration: `league_rules` + `league_fixture_penalties` + default-rule trigger.
2. Super Admin **Rules** tab (CRUD).
3. Wire `useLeagueRules` into `MatchMarkerModule` + scorecard validation.
4. `NsaPenaltyBadge` + insert into fixture detail.
5. Pre-submit warnings in `NsaSubmitDialog`.
6. Super Admin **Penalties** tab + `sync-league-penalties` edge fn.

I'll do this in 2 batches and check in between.