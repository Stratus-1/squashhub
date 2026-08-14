# One tournament wizard for club, association and federation

Goal: association and federation tournaments are planned with the exact same wizard the clubs use (capacity, courts, time slots, leagues/pools, schedule preview), and every field lives in exactly one place — no duplicate entry fee, dates, or format.

## 1. Reuse the club wizard at every level

The club wizard (`ClubChampsTab`) already does everything the higher levels need: category, courts and time slots, registration, players, leagues/pools, schedule generation and preview. Instead of building a second wizard, it becomes owner-aware:

- New optional props: `ownerOrgId` (the body running the event), `scope` (`club` | `association` | `federation`), and a **host venue** selection.
- **Courts step**: today it loads courts of one club. It becomes multi-venue — pick one or more host clubs, then per club pick courts and per-court time windows. Club level behaves exactly as now (its own club pre-selected, single venue, nothing to choose).
- **Players step**: the entrant pool widens with scope — club level = own members (unchanged); association = members of affiliated clubs; federation = members nationwide. Search is club-filtered so the list stays usable.
- Super Admin -> Tournaments becomes the mount point: pick the owning body, then the same wizard opens. The current thin create dialog there is replaced by it.

Club-level behaviour is unchanged by default — every new capability is opt-in via the new props.

## 2. Fill the gaps for higher-level tournaments

Fields that matter for association/national events but are missing from the wizard today, added as a **Tournament type** block on the first step:

- Event type: closed / open / invitational / championship / ranking event / league finals
- Draw type: round robin, groups + playoffs, Swiss, knockout, MONRAD (already in Rules — surfaced here so it is set once, at creation)
- Standard of play, best-of, points per game, win condition (same fields as the Rules dialog, same storage)
- Age/grade categories and gender categories per league (men / ladies / mixed / open already exist)
- Entry limits: max entrants overall and per league, plus a seeding source (ladder / ranking / manual)

## 3. Remove the double entry

Right now three fields exist in two places:

| Field | Today | After |
|---|---|---|
| Entry fee | wizard **and** governance | governance only, shown read-only in the wizard with an "Edit in Governance" link |
| Registration opens / closes | wizard **and** governance | governance only, same treatment |
| Scoring format / draw type / standard of play | wizard **and** Rules dialog | rules table only; the wizard reads and writes that same record |

The tournament row keeps only operational data (name, dates, host, leagues, groups, schedule). Governance keeps money, sanctioning, eligibility and refunds. Rules keeps how the game is played. Reads keep working because the wizard is repointed at the same records — no data is dropped or migrated away.

## 4. Governance at club level

Governance stays available to clubs (a club can sanction and charge for its own event) but is trimmed to what a club actually needs: entry fee and split, registration dates, refunds. Sanctioning authority, competition level and federation share stay visible only when the owner is an association or the federation, so club admins are not asked questions that do not apply to them.

## 5. Documentation

`docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md` gets a **Tournaments** section that records the club-level flow exactly as it works today (wizard steps, generation, scoring, marker routes) as the reference baseline, plus the field-ownership table above, so the working club behaviour is protected during the refactor.

## Sequencing

1. Docs baseline + field-ownership table (no code risk).
2. De-duplicate fee / dates / format — wizard reads governance and rules records.
3. Owner-aware props + multi-venue courts step + wider entrant pool.
4. Mount the wizard in Super Admin -> Tournaments for association and federation owners.
5. Add the tournament-type / limits / seeding block.

Each step is independently shippable and club-level tournaments keep working throughout.
