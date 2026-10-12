# Rankings & Ratings — impact review and Riverside-only ladder pilot plan

**STATUS: PROPOSAL ONLY — NO IMPLEMENTATION IS APPROVED.** No code, database, data, deployment or publish actions happen under this plan until the owner approves each phase. Uitsig stays unchanged throughout.

Pilot scope: ladder settings, milestone triggers and running-tournament approval prompts, Riverside only. The club internal rating is a separate, deferred phase (section 7) and not part of the pilot.

## 1. Impact review of changes already made today

| Change | Where | Live now? | Effect on Uitsig Club Champs 2026 |
|---|---|---|---|
| Duplicate-application check (same login/email at a club blocks a second self-application) | Shared backend | Yes | No effect on tournament setup, draws, results, ladder or notices. Only affects new self sign-ups to a club. |
| Player-record matching on sign-up now uses the login email | Shared backend | Yes | No tournament effect. **Risk:** a family member who signs up with their own login but a shared email and no SA ID could be linked to the existing person record instead of getting their own. |
| Friendly "already a member" message on sign-up | Preview only | No | None. |
| Ladder rule: club "tournaments may not move the ladder" now always wins over a tournament "yes" | Shared backend | Yes | **No change for Uitsig.** Uitsig allows tournament ladder moves and its tournament is on "use club setting", so per-match ladder moves happen exactly as before. 0 tournaments anywhere were affected. |
| "Affect club ladder" Yes/No in the new builder (new tournaments default No) | Preview only | No | None. The live app does not have it, and it only writes when a tournament is saved from the preview builder. |
| Diamond League "Registration pending" card, result-entry dialog wording | Preview only | No | None. |

Uitsig today: tournament `Uitsig Club Champs 2026` (planning), ladder setting = inherit, club allows tournament moves, automatic apply ON. So **once Uitsig's singles results are finished, the ladder will move game by game automatically**, which is the existing behaviour and not caused by today's work. The owner may want that confirmed with Uitsig before play starts.

### Containment options (only with approval)
- C1 (recommended, low risk): revert the player-record email matching on sign-up to its previous form, keeping only the duplicate-application block. This removes the family-shared-email linking risk.
- C2: also revert the duplicate-application block (fully back to this morning).
- C3: revert the ladder rule change. Not needed for Uitsig (identical behaviour); listed for completeness.
- C4 (Uitsig decision, data write): set Uitsig Club Champs to "No — leave the ladder alone" if Uitsig does not want tournament results to move its ladder.
- Ask the owner not to publish the preview until the pilot is signed off; the preview-only builder switch would otherwise ship with it.

## 2. Pilot gating (Riverside only)
- Club gate: one per-club pilot flag (existing club beta-features mechanism), ON only for Riverside. Every new behaviour checks it on the server, never in the browser alone.
- Tournament gate: new settings stored per tournament; empty = today's behaviour. A tournament outside Riverside can never get non-empty settings (server refuses).
- Kill switch: turning the Riverside flag off returns all Riverside tournaments to today's per-match behaviour; nothing is deleted.
- Riverside's live Club Champs keeps today's behaviour; pilot runs only on a new synthetic Riverside test tournament.

## 3. Builder "Rankings & Ratings" step (pilot clubs only)
- A. Does this tournament move the club ladder? Yes / No (new = No). Disabled with an explanation when the club does not allow it.
- B. When? After each finalized match / after each completed round / when the tournament is completed (recommended default for multi-week).
- C. How? Automatically at that point / admin previews and approves at that point (recommended default).
- No rating questions in the pilot step. Imported SportyHQ, regional league and national ratings/rankings shown in My Stats are untouched by anything in this plan.
- Old builder shows the same settings read-only so both builders agree.

## 4. Ladder engine behaviour (pilot tournaments only)
- Each eligible finished singles game creates one recorded ladder entry (unique per game), instead of moving the ladder directly, unless timing = per match + automatic.
- At the milestone (round fully played / tournament completed) entries are processed in game order: date, then time, then game reference.
- Automatic: applied in that order. Approve: admin sees a before/after ladder preview and approves or rejects the batch or single moves; who, when and order are recorded.
- No double application: unique entry per game; a batch applies once; repeated triggers do nothing.
- Finalized results stay protected: the ladder engine never edits match results.

## 5. Running-tournament prompts (pilot only)
- Tournament page banner when a milestone is reached: "Round 2 complete — 6 ladder moves ready to review" with Review / Approve / Reject.
- Automatic mode shows "Ladder updated after Round 2" with a link to the moves.
- No messages to players are sent by this feature.

## 6. Corrections and reversals
- Correction before the entry is applied: entry replaced, nothing to undo.
- Correction after it was applied: a reversal entry is recorded and the admin confirms the re-apply; positions are never silently rewritten.
- Ladder positions from before the pilot are never changed.

## 7. DEFERRED — optional club-only internal rating (separate phase, not in the pilot)
- Not being built now; recorded so the pilot does not block it later.
- Today: no internal rating exists. My Stats shows imported SportyHQ, regional league and national figures; these stay entirely separate and unchanged.
- Future shape: each club explicitly enables it, then chooses "Seed ratings" once, starting from the current club ladder order (using imported SportyHQ ratings as the baseline is a later option, not now).
- After seeding, eligible verified club matches adjust that club's rating incrementally, once per match; corrections reverse and re-apply.
- Club-specific only: no national or regional effect, no cross-club rating. Showing it in My Stats comes later.
- Independent of the ladder switch. Formula and eligible match types to be decided when this phase is opened.

## 8. Test strategy
- Unit tests: setting rules (club upper limit, defaults), ordering, idempotency, reversal logic.
- Check that My Stats external figures and Uitsig ladder outcomes are identical before and after.
- Database tests on a synthetic Riverside tournament with synthetic players: multi-week, results entered out of order, round and end milestones, approve/reject, correction after apply, repeated triggers.
- Isolation tests: Uitsig and another club produce identical ladder outcomes before and after (comparison of decisions for the same inputs).
- Browser check of the builder step and running-tournament prompts as a Riverside admin, preview only.
- Rollback rehearsal: flag off returns to today's behaviour.

## 9. Phases (each needs owner approval)
1. Containment choice (C1–C4) and "do not publish" confirmation.
2. Builder settings stored, Riverside gate, no engine change.
3. Ladder engine for pilot tournaments + prompts + tests.
4. (Deferred, separate approval) Club-only internal rating — see section 7.
5. Sign-off, then staged rollout to other clubs.

## Technical notes
- Live functions changed today: `club_members_block_duplicate`, `ensure_person_for_club_member`, `award_points_for_champ_match` (migrations 0121–0123). Previous definitions are recorded in earlier migrations and can be restored exactly.
- Preview-only files: `StepByStepBuilder.tsx`, `step-handover.ts`, `MemberOnboardingWizard.tsx`, `src/test/step-ladder-affects.test.ts`, plus issue log and builder AGENTS notes.
- Planned pilot storage: nullable tournament columns for timing and apply mode, a ladder-entry ledger with a unique key per game and version, and a batch/approval audit table, all club-scoped with RLS. No rating storage in the pilot.
