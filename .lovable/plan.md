# Step by Step beta → existing tournament system: compatibility audit (read-only)

## Verdict: NO-GO for publishing a Riverside tournament today
Step by Step stores all answers only in the browser on one device (`localStorage`, key per club). It **reads** courts, active members, leagues and club channel flags from the database, but **writes nothing**. There is **no beta → tournament mapping** of any kind: no create, no draft, no conversion into the Current Builder's definition or the normal Tournaments editor. Publishing today would mean nothing is created; any hand-built bridge would lose or misinterpret most settings below.

Context verified: `club_champs` is a view over `tournaments`. Riverside's 6 live tournaments are all legacy (no structured spec). Its 2 server Beta drafts belong to the Current Builder and are unrelated to the device-local Step by Step answers.

## Classification (1 compatible, 2 partial, 3 beta-only/lost, 4 unsafe)

| Concept | Class | Gap and where |
|---|---|---|
| Singles / Doubles / Singles and Doubles + inheritance | 2 | Per-division `league_match_types` exists (legacy); inheritance is not stored, only resolved values. Mixed singles+doubles in one category has no single-row representation (mapping). |
| Categories / subcategories | 2 | Legacy has flat divisions (group numbers); Beta definition has divisions/sections. No two-level keyed hierarchy with stable IDs (schema/mapping). |
| Entry modes (selected + open invite) | 2 | Invite audience/member IDs exist; per-subcategory combination of preselected + open is not representable (schema/UI). |
| Eligibility per category | 2 | Eligibility fields are tournament-level; "Players from" league sources per division partly exist. Per-subcategory league eligibility not stored (schema). |
| Preselected players / full member load | 2 | `invite_audience_member_ids` is tournament-wide; placement into a specific subcategory not stored until registrations exist (mapping/runtime). Member loading itself is fine (UI). |
| Invitations / audience | 2 | Fields exist; audience is tournament-wide, not per group (schema). |
| Messaging channels / draft body | 3 | `invite_audience_methods` and short-message flag exist, but the custom draft body has no home; would be lost (schema). Must not send. |
| Doubles partner rule per subcategory | 4 | `partner_mode` is a single tournament value; mapping different rules per subcategory would apply the wrong rule at registration (schema/runtime). |
| May enter both / may pay for both (Yes/No/Decide later) | 4 | No independent persisted permissions; existing group-entry/pay-for-others behaviour has its own assumptions. "Decide later" could collapse to No or Yes (schema/runtime/payment). |
| Fees: free / per player / per pair / per category | 4 | One `entry_fee_cents` per tournament; no per-pair basis, no per-category amounts. Charging would be wrong (schema/payment). |
| Scoring: Standard vs Bells, PAR, best-of, win-by-2/sudden death, overrides | 2 | Legacy per-division maps (`league_scoring_modes`, points, best-of, win condition, Bells durations) cover resolved values per division; subcategory-level override and inheritance not stored. Beta definition is tournament/stage/round, not category keyed (mapping). |
| Dates and courts | 2 | Legacy round dates/courts and structured courts exist; Step by Step date windows/court picks need mapping to round-plan/stage scheduling (mapping/runtime). |
| Playoffs (provisional) | 3 | Planning labels only; pool vs knockout structure undefined, so no safe mapping to stages, qualification or pairing. Deliberately unfinalised. |
| Advisory tips / counts | n/a | UI-only by design; need not persist. |

## Minimum work before enabling Create/Publish from Step by Step

**A) Shared data model / persistence**
1. One versioned tournament definition as the single source of truth, with stable IDs for categories and subcategories (extend the Beta structured definition, not a new store).
2. Per-group fields: discipline, scoring, eligibility, entry mode/audience, partner rule, fee amount + basis (player/pair), enter-both and pay-for-both as tri-state (Yes/No/Undecided).
3. Server-side draft for Step by Step answers (club-scoped, RLS, grants, audit) replacing device-local storage.
4. Message draft body stored as configuration only.

**B) Existing builder**
5. Normal Tournaments editor must detect definition-backed tournaments and route to a structured-aware editor instead of overwriting with single tournament values (partner mode, fee).
6. Current Builder/structured editor must open and edit every per-group field from A without flattening.

**C) Runtime**
7. Registration enforces per-group partner rule and enter/pay permissions; Undecided blocks opening entries, never defaults.
8. Payments charge per-group amount and per-pair basis, host club owned.
9. Marker/standings read per-group scoring (extend `effectiveTournamentSettings` beyond group number to subcategory).
10. Fixture generation/scheduling from the definition only once pool/knockout structure exists.

**D) Beta mapping**
11. Pure, tested adapter: Step by Step answers → definition, with reverse hydration and round-trip tests.
12. Unsupported or undecided options block Create with a clear reason; never dropped or guessed.
13. Riverside-only dry run (create, reopen, edit, invite preview, payment preview) before any live entries.

## Keep advisory / UI-only
SquashHub tips, estimated entries, provisional counts, playoff fit checks, time estimates.

## Prioritised blockers
1. No persistence or mapping exists at all (device-local only).
2. Fees per category/per pair not representable (wrong charges).
3. Partner rule and enter/pay permissions per subcategory not representable; Decide later would collapse.
4. Normal editor would overwrite structured/per-group settings with single values.
5. Category/subcategory hierarchy and per-group scoring/eligibility not keyed.
6. Competition structure (pools vs knockout) and playoffs undefined.
7. Message body, per-group audience not stored.

Scope: audit only. No code, database, data or publishing changes. Approving this does not start any build work.
