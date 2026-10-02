# Step by Step beta: compatibility audit (read-only)

## Verdict: NO-GO for publishing a Riverside tournament today
- Step by Step only **reads** from the database (courts, active members, leagues, club WhatsApp/SMS flags). It saves every answer in the browser on one device, one set per club. It never writes to the database.
- There is **no mapping from beta answers to a tournament**: no create, no draft, and no conversion into the Current Builder's definition or the normal Tournaments wizard. Publishing today would create nothing. A quick bridge would lose or get wrong most settings below.
- SquashHub already has **three ways to set up a tournament**, none of which share code:
  - the normal Tournaments wizard (9 steps, writes tournament columns directly);
  - the Beta Current Builder (5 tabs, one structured definition);
  - Step by Step (device-local only).
  Each one has its own controls for playoffs, format, scoring, fees, invitations and courts.
- Riverside context: it has 6 live tournaments, all built the old (legacy) way. Its 2 server-side Beta drafts belong to the Current Builder and are separate from the Step by Step answers.

## 1. Concept classification
Classes: 1 = compatible now, 2 = partly compatible, 3 = beta-only (lost on publish), 4 = unsafe.

| Concept | Class | Gap (where) |
|---|---|---|
| Singles / Doubles / Singles and Doubles + inheritance + overrides | 2 | Wizard stores match type per division; Beta stores it per stage. Neither stores the inheritance itself. A category playing both singles and doubles must be split (mapping). |
| Categories / subcategories | 2 | Wizard has flat leagues; Beta has divisions with sections. Neither has a keyed category → subcategory tree with stable IDs (data model). |
| Entry modes (organiser picks + open invite) | 2 | Audience and member lists are tournament-wide. Different modes per subcategory can't be stored (data model). |
| Eligibility per category | 2 | Wizard "Who may enter" is tournament-wide. Beta has league sources per division, not per subcategory (data model). |
| Preselected players / full member loading | 2 | Loading works. Placing a picked player in a specific subcategory isn't stored before registration exists (mapping). |
| Invitations / audience | 2 | Fields exist in both builders but are tournament-wide (data model). |
| Messaging channels + draft message | 2 | Channels and wording exist in both builders. The beta's per-channel draft and preview have no place to be saved (mapping). Must never send. |
| Doubles partner rule per subcategory | 4 | Partner mode is one value for the whole tournament, and only the wizard has it. The Beta builder has no partner setting. Per-group rules would be applied wrongly (data model/runtime). |
| Enter both / pay for both (Yes / No / Decide later) | 4 | Nothing stores these. Today's group-entry and pay-for-others behaviour makes its own assumptions. "Decide later" would turn into Yes or No (data model/payments). |
| Fees: free / per player / per pair / per category | 4 | One entry fee per tournament in both builders. No per-pair basis and no per-category amounts, so players would be charged wrongly (data model/payments). |
| Scoring: Standard vs Bells, PAR, best of, win by 2 / sudden death, overrides | 2 | Wizard stores scoring per division; Beta stores it per tournament → stage → round. Neither stores subcategory overrides or inheritance (mapping). |
| Dates and courts | 2 | Three separate court pickers exist (wizard Courts step, Beta Design tab, post-create editor). Beta date windows don't match wizard rounds or scheduling modes (mapping/runtime). |
| Competition format | 3 (not yet asked) | Step by Step doesn't ask yet. Both builders already offer Round Robin/Pools, Knockout, Swiss and cross-league, but with different value lists. |
| Playoffs (provisional) | 4 if published | Planning labels only. They can't be correct until the competition format is chosen. This duplicates three existing playoff controls (see section 3). |
| Tips, estimated / actual counts | advisory | Shown on screen only by design. Need not be saved. |

## 2. Current builder inventory, page by page

### Normal Tournaments wizard (9 steps)
| Step | Controls now | Overlaps beta | Missing for guided tournaments | Recommendation | Preserves beta data? |
|---|---|---|---|---|---|
| Category | Name, category, Who may enter, max entrants / per league, seeding | Eligibility, entries | Category/subcategory tree, eligibility per group | Keep name/seeding. Move eligibility to a per-group setting | No |
| Structure | Format palette per league (Round Robin single/double, Swiss, cross-league, Knockout); match type and scoring per league; Playoffs All/None; per-league playoff tick; playoff mode (position vs crossover); qualifiers per pool; Swiss knockout top N | Discipline, scoring, playoffs | Subcategories, inheritance, discipline per group | Make this the single home for format and playoffs. Show playoff options only after a format is chosen | Partly (per-division values only) |
| Registration | Who gets in, confirmation, fee on/off + amount, when fees are due, payment methods, handicap | Fees, entry rules | Per-pair basis, per-group fees, enter/pay permissions | Consolidate fee rules here, set per group | No |
| Courts | Club- vs self-scheduled, champion scope, nights/times, date window, registration dates, withdrawals, courts, per-day settings | Dates, courts | Nothing major | Keep. Single home for dates and courts | Mostly |
| Invites | Audience (clubs/leagues/individuals/all club), pickers, message, channels, send timing | Invitations, messaging | Audience per group | Keep. Add a per-group audience | Partly |
| Players | Pair invites; partner mode admin vs players | Partner rule, preselected players | Per-subcategory partner rule, "Decide later" | Move partner rules to each doubles group | No |
| Groups / Schedule / Review | Pool allocation, round dates, summary | Feeds into later stages | Nothing | Keep | Not affected |

### Beta Current Builder (5 tabs + post-create editor)
| Tab | Controls now | Overlaps | Recommendation |
|---|---|---|---|
| Design: event setup | Level, owner, audience, expected entries, seeding, venues and courts | Basics, courts, estimates | Keep as the basics source |
| Design: quick setup | Singles/doubles, pools, **"Will there be play-offs?" tick**, qualifiers, knockout, 3rd/4th place, scheduling | Discipline, format, playoffs | Show the playoff tick only after the format is chosen; Step by Step playoffs feed this same field |
| Design: stage builder | Match type and format per stage (Round Robin, cross-pool, Swiss, Knockout), pools, legs, Swiss rounds, 3rd/4th, scoring, Define later | Discipline, scoring, format | This becomes the engine form underneath all builders |
| Players | Entry method, audience, allocation, min/max entries, league sources per division | Entry modes, eligibility | Add per-subcategory scope |
| Schedule | Weekday, start, venue, match minutes, sessions | Dates, courts | Keep |
| Invitations | Sending, channels, registration window, reminders, wording, **fee, payment methods**, WhatsApp group, results incl. "Play-offs only" | Messaging, fees | Fees duplicate the wizard. Move to one per-group fee model |
| Review / post-create editor | Readiness, Create; date window, courts, stage links | — | Must show every guided field, read-only where it can't be edited |

## 3. Duplicates and multiple sources of truth
1. **Playoffs are set in 4 places:** wizard per-league tick + mode + qualifiers; wizard Swiss top N; Beta quick-setup tick; Beta knockout stage; plus Step by Step's Playoffs step. Beta treats playoffs as a stage; the wizard treats them as on/off per league.
2. **Format lists:** the wizard's list and the Beta list are separate.
3. **Scoring:** wizard per league, Beta per stage/round, Step by Step per category/subcategory.
4. **Fees and payment methods:** set in the wizard Registration step and the Beta Invitations tab.
5. **Invitations and channels:** set in the wizard Invites step, the Beta Invitations tab and Step by Step messaging.
6. **Eligibility vs audience:** the wizard combines them; Beta keeps them separate.
7. **Courts:** three pickers.
8. **Partner mode:** wizard only, tournament-wide; Step by Step sets it per group.

Obsolete or derived: the wizard's old overall playoffs flag (already computed from per-league ticks) and the "All/None" buttons should become shortcuts for setting the default, not settings of their own.

## 4. Recommended single-system flow
```text
1 Basics        owner, name, level, dates window
2 Categories    category > subcategory tree (stable IDs)
3 Discipline    default + overrides
4 Format        Round Robin/Pools | Knockout | Swiss  (default + overrides)
     conditional: pools/legs | bracket size/seeding | Swiss rounds
5 Scoring       Standard/Bells, PAR, best of, win rule (default + overrides)
6 Playoffs      only if format allows (pools/Swiss -> playoffs; knockout -> none)
7 Players       eligibility, entry mode, preselected, partner rule per doubles group
8 Fees          free/player/pair, amounts per group, enter-both, pay-both (tri-state)
9 Invitations   audience, channels, wording (no sending until live)
10 Courts & schedule
11 Review       readiness, tips (advisory), Create
```
- Step by Step and the advanced builder are two views of this same model. "Default + overrides" is one shared pattern.
- **Existing tournaments are protected:** legacy tournaments keep opening in today's wizard unchanged. Only tournaments created from the new definition open in the new flow, and the wizard must refuse to overwrite them with single tournament-wide values.

## 5. Minimum work before enabling Create
**A) Shared data model**
1. One versioned tournament definition with a stable category/subcategory tree.
2. Per-group settings: discipline, format, scoring, eligibility, entry mode, audience, partner rule, fee amount + basis, and enter-both / pay-both as Yes / No / Undecided.
3. Server-saved Step by Step drafts per club (secure access and an audit trail).
4. A saved message draft (configuration only).

**B) Existing builder**
5. Route definition-based tournaments to an editor that understands them. The wizard must not save over them.
6. Merge the playoff controls into one model shown after format. Merge fees and courts into one model each.
7. Show every per-group field, editable or clearly read-only.

**C) Runtime**
8. Registration enforces each group's partner rule and enter/pay permissions. "Undecided" blocks entries from opening.
9. Payments charge each group's amount, per player or per pair, to the host club.
10. Marking and standings read per-group scoring.
11. Fixtures and schedules are generated from the definition, only once the format is defined (Round Robin, Knockout, Swiss).

**D) Beta mapping**
12. Add a competition format step before Playoffs in Step by Step.
13. A tested converter in both directions (save, then reopen with nothing lost). Unsupported or undecided options block Create with a reason.
14. Riverside-only dry run: create, reopen, edit, invitation preview, payment preview.

**Keep on screen only (not saved):** tips, estimated and provisional counts, playoff fit checks, time estimates.

## 6. Prioritised blockers
1. Nothing is saved and no mapping exists.
2. The competition format isn't defined yet; playoffs depend on it.
3. Fees per group or per pair can't be stored, so charges would be wrong.
4. Partner rule and enter/pay permissions per group can't be stored; "Decide later" would be lost.
5. The wizard would overwrite per-group settings with tournament-wide values.
6. Playoffs, fees, invitations and courts each have duplicate controls.
7. There's no category/subcategory tree or per-group scoring and eligibility.

Scope: audit only. No code, data, database or publishing changes.
