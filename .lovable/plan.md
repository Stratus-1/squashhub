# Diamond League (Uitsig) — real format in the Beta Builder + reusable template

## What the organiser will get
- A **Diamond League** starter in the Beta Builder. It loads the real Uitsig structure:
  - 48 players, admitted first-confirmed, then a waiting list
  - ladder seeding with snake allocation across 8 pools
  - 2 identical divisions, each with Pools A–D of 6
  - singles cross-pool league → doubles pairs (#1+#2, #3+#4, #5+#6) → doubles cross-pool league → crossover play-offs
- **Save as template:** any finished design can be saved as a reusable club template. Fixed competition rules are kept apart from the settings you change each time: dates, times, courts, capacity/admission and scoring.
- **Review screen** gets a "Needs organiser confirmation" list. Items on it block Create until they are answered, or until you deliberately choose "proceed, decide later" for rules only needed at a later stage. For this instance the list shows:
  1. the singles and doubles points formula
  2. how the final works
  3. whether play-off and final points count towards the winning pool
  4. the exact Tuesday dates and how many rounds are played each Tuesday
- **Transcript / voice note → interpretation:** the builder first shows a structured reading of what you said, with each rule marked Confirmed or Needs confirmation. It builds only the confirmed parts. It never swaps an unusual rule for a standard round robin or knockout.
- Existing formats (round robin, Swiss, knockout, pools + play-offs, stage builder) behave exactly as today.

## New building blocks (general, not Uitsig-only)
1. **Cross-pool league format:** players in the same position in different pools play each other (A#1 v B#1, C#1, D#1 …). Pool position is set by seeding. Each player gets (pools − 1) matches, so a division with 4 pools of 6 has 36 singles matches.
2. **Position-based pair forming:** doubles pairs are built inside each pool from current ranked positions, using the pairs you set (default 1+2, 3+4, 5+6). The pair keeps its players' identities. They are never treated as pre-entered teams.
3. **Pool / team points:** player points roll up into a pool total. The formula is stored as **unconfirmed** by default and nothing is invented. Standings show match counts until the formula is confirmed.
4. **Crossover play-offs between paired pools:** A#1 v B#2, B#1 v A#2, and A#3 v B#4, B#3 v A#4, mirrored for C+D and in Division 2. This uses the existing stable pool/slot mapping, extended to position blocks. The final/placement stage is shown as "needs confirmation" and is not generated until it is defined.
5. **Admission rule:** a capacity plus mode (first confirmed / manual), with a waiting list. The rule is editable in the template.
6. **Home-court groupings:** each pool pair is linked to a preferred court (Div 1: A+B → Court 1, C+D → Court 2; Div 2: A+B → Court 3, C+D → Court 4). Fixture scheduling uses these first. The admin can still move any game.
7. **Schedule maths extension:** it counts the fixtures each stage actually generates per court group against the available Tuesdays × rounds per evening × courts. It checks that stages come in order. Schedule shows green only when the plan is feasible. Missing dates show as incomplete, never as complete.

## Assumptions (please correct if wrong)
- The pool order used for doubles pairing comes from **singles-stage pool standings** once scoring is confirmed. Until then it comes from the original seeding. This is shown as a confirmation item.
- The play-off pool pairs are A+B and C+D (the same as the court groupings).
- The waiting list promotes automatically when an accepted player withdraws, and the admin is notified.

## Technical details
- `definition.ts` (additive; old drafts still parse):
  - new stage kind `cross_pool_league`
  - `admission { capacity, mode, waitlist }`
  - `seeding { source: "ladder", allocation: "snake", scope: "tournament" }` (snake runs across all 8 pools, over both divisions)
  - `poolPairs` and `homeCourts` per division
  - `scoring.status: "confirmed" | "unconfirmed"`
  - `openQuestions[]`, each with a stable key, stage reference and whether it blocks Create
  - `templateMeta` that lists which fields are instance settings
- Engine (`engine-service.ts`, `structured-persist.ts`, `contractIssues`): a same-position cross-pool generator for singles and pairs. It reuses `form_pairs`, with an explicit positions pairing list per pool. The crossover mapping uses `qualifierTransition.poolPairs` with position blocks. Knockout fixtures keep `pool_id` NULL.
- Snake allocation across divisions: an extension of `seeding.ts`/pool-distribution, with a manual override step before generation.
- Templates: a new `tournament_templates` table (club-scoped, with RLS for tournament managers of that club, GRANTs, audited). It stores the definition with its instance fields stripped. The Diamond League system template ships as code in `presets`/`stage-builder.diamondTemplate`, replacing the old simplified RR→RR version.
- Interpretation: the existing voice/AI proposal returns a structured interpretation with per-rule `confirmed` flags and `openQuestions`. The UI shows an "Interpretation" review before anything is applied to the draft.
- Tests:
  - 48 → 2×4×6 snake allocation
  - 36 singles + 18 doubles fixtures per division
  - pair identities preserved
  - crossover slots mirrored for C+D and Division 2
  - unconfirmed scoring or final blocks the relevant generation
  - home-court assignment
  - infeasible Tuesdays flagged red
  - no regressions in existing quick-path, stage-builder and pool play-off suites
- Docs: `TOURNAMENT_ENGINE_INTEGRITY.md` and the issue log are updated. Nothing is published.
