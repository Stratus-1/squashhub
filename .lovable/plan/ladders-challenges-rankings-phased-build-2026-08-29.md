# Ladders, Challenges & Rankings — phased build

## Phase 0 audit (done)

What already exists and will be reused, not rebuilt:

- `challenges` + `challenge_schedules` — full challenge lifecycle incl. counter-proposals and court booking links.
- `club_members.ladder_position` — the single source of truth for ladder order (per existing project rule).
- `club_member_ladder_history` and `ladder_adjustment_log` — audit trails for every position move.
- `ranking_points_ledger` / `ranking_points_pending` — club-level points with review flow.
- `association_ranking_settings`, `ranking_rubber_points`, `ranking_snapshots(+entries)` — regional (NSA) league-rubber ranking model.
- `sportyhq_profiles` — imported external baseline ratings.
- UI: `src/pages/Ladder.tsx`, `MyChallenges.tsx`, `IncomingChallengesCard.tsx`, `src/lib/ranking-points.ts`, `src/lib/rankings/model.ts`.

Gaps versus the spec: no challenge-format config (only `club_rules.challenge_levels_up`), no pyramid mode, no Challenge Centre, no generic org-owned ranking systems with versioned rules, no per-competition ranking-impact links, no provisional/unranked status model.

## Phase 1 — Club Challenge Engine + Challenge Centre

- New `ladder_configs` row per club: format (`standard` | `pyramid`), activation state, accept/complete deadlines, concurrent-challenge limits, cooldown, no-show/walkover policy, movement policy, `affects_club_ranking` flag. Seeded from existing `challenge_levels_up` so nothing changes behaviour on day one.
- Eligibility as one pure function (`src/lib/ladder/eligibility.ts`) used by UI **and** by a DB validation trigger/RPC on `challenges` insert — server-side rejection, not just UI hiding.
- Replace the isolated dashboard challenge prompt with a **Challenges tile** opening a **Challenge Centre** page: my position, format, who I may challenge, incoming/outgoing, statuses, history.
- Movement policy applied through the existing `apply_ladder_adjustments` RPC so audit rows are written automatically.
- Club Admin > Ladder & Challenges screen: seed/reseed with reason, format + rules, list/pyramid preview, active challenges, exceptions, history.

## Phase 2 — Pyramid mode

- Derive rows from ladder order (1 / 2-3 / 4-6 / 7-10 …), matching the supplied example, with the row structure stored in config rather than hard-coded.
- Interactive mobile-first pyramid: my cell highlighted, eligible opponents highlighted and tappable to open the challenge action, ineligible/unavailable states dimmed. Auto-rebuild after any position change.

## Phase 3 — Generic ranking engine

- `ranking_systems` (owner organisation + level), `ranking_rule_versions` (immutable versioned config), `player_rankings` (points, displayed rank, status: unranked / provisional / ranked / inactive, provisional progress), `ranking_transactions` (before / delta / after, rule version, reversal links), `external_ranking_snapshots` (SportyHQ baseline kept separate and never overwritten).
- Existing club ledger and association settings are wrapped as ranking systems rather than replaced.
- Admin rules editor with a simulation tool (two sample players + a result → predicted points) before publishing a new rule version.

## Phase 4 — Competition integration

- `competition_ranking_links`: each league/tournament declares which ranking systems it affects, permission-aware (a club cannot self-declare national impact).
- One confirmed result dispatches an idempotent ranking event to each approved system; corrections reverse then re-apply, never delete.
- "Ranking & Ladder Impact" section in competition setup, with a warning before publishing an incomplete/unauthorised configuration.

## Phase 5 — Migration & rollout

- Backfill existing clubs/associations into the new config tables with current behaviour preserved; go-live date per organisation; preview-before-recalculate only, no bulk recalculation without approval.

## Technical notes

- Ladder position and ranking points stay separate fields and separate engines throughout.
- All new tables: `GRANT`s + RLS scoped by club/association, no `SECURITY DEFINER` shortcuts beyond the existing reviewed helpers.
- Vitest coverage for eligibility (standard + pyramid), movement policy, idempotent ranking dispatch, correction reversal and provisional graduation.
- Nothing is deployed to production in this work; existing leagues, fixtures, standings and results remain untouched.

## Suggested first slice

Phase 1 in full (config + eligibility + Challenge Centre + admin screen), since it is self-contained and immediately visible to members.
