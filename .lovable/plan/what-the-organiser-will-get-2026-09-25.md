## What the organiser will get
- A **Diamond League** starter in the Beta Builder. It loads the real Uitsig structure and is shown as this chain:

```text
Registration (first 48 confirmed, rest wait-listed) -> Ladder seeding (admin can adjust)
-> 8 seeded pools (snake) -> Singles R1 -> Singles R2 -> Singles R3
-> Re-rank EACH pool from singles results -> Auto-form doubles 1+2 / 3+4 / 5+6
-> Doubles stage -> Play-offs / final / overall pool result
```

- **Open category:** men, ladies, boys and girls play together. The two divisions of 24 are only a way of organising play, not a gender or age split.
- **8 named pools:** each pool keeps a fixed internal slot (Division 1 A–D, Division 2 A–D) and has its own editable name. Once a name is entered, it shows on admin and player screens.
- **Singles:** three cross-pool rounds. Each position plays the same position in every other pool, and every pool meets every other pool once (for example A v B, then A v C, then A v D).
- **Doubles are formed from singles results, not from the ladder.** Once all three singles rounds are complete, each pool is re-ranked #1–#6 from its singles points. Pairs are then formed as 1+2, 3+4 and 5+6. The builder shows these pairs as "decided after Singles R3" and never guesses them in advance. If the points formula or tie-break is missing, Review says the ranking cannot be decided. No pairs are made up.
- **Dates:** five Wednesdays, 7, 14, 21 and 28 Oct and 4 Nov 2026. Singles are on the first three. Wednesdays 4 and 5 show as *doubles / play-offs, needs confirmation* and are not locked in.
- **Save as template:** the fixed competition rules are stored separately from the settings you change each time: dates, times, courts, capacity/admission, pool names and scoring.
- **Review "Needs organiser confirmation"** lists:
  1. the singles/doubles points formula and tie-break (this also decides the doubles pairs)
  2. how the final works
  3. whether play-off/final points count towards the winning pool
  4. which of Wednesdays 4 and 5 is doubles and which is play-offs/final
- **Transcript / voice note → interpretation:** the builder shows a structured reading with each rule marked Confirmed or Needs confirmation. It builds only confirmed logic and never falls back to a standard round robin or knockout.
- Existing formats are unchanged.

## New building blocks (general, not Uitsig-only)
1. **Cross-pool league format:** same-position players across pools, arranged as a pool-v-pool rotation with one pool pairing per round. With 4 pools there are 3 rounds and 36 singles games per division.
2. **Results-derived participants:** a later stage can list its entrants as "to be decided from Stage N standings, per pool". It stays *pending* until the earlier stage is complete and its standings can be worked out. Only then are the pairs created (pair identities kept), after which that stage's games are generated.
3. **Pool / team points:** player points roll up into a pool total. The formula stays **unconfirmed** and nothing is invented.
4. **Crossover play-offs between paired pools:** A#1 v B#2, B#1 v A#2, A#3 v B#4, B#3 v A#4, mirrored for C+D and for Division 2. The final is shown as "needs confirmation" and is not generated.
5. **Admission rule:** capacity plus mode, with a waiting list. It is editable, set to 48 / first-confirmed here.
6. **Home-court groupings:** Div 1 A+B → Court 1, C+D → Court 2; Div 2 A+B → Court 3, C+D → Court 4. These are preferred courts and the admin can change them.
7. **Schedule maths:** real games per court group against the Wednesdays × courts available. Stage 2 must fall after Singles R3 plus the re-rank step. Green only means the schedule can actually be played.

## Assumptions (please correct if wrong)
- Play-off pool pairs are A+B and C+D, the same as the court groupings.
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
