# Nelspruit league rename + create/edit league capability

## Findings

### 1. What "Nelspruit Internal League" actually is
It is a row in `league_associations` (the *league* level), not a team:

- id `64eac759-…`, name `Nelspruit Internal League`, abbreviation `NIL`, scope `internal`, club Nelspruit, `platform_association_id` -> a mirror row in `platform_league_associations` (also named "Nelspruit Internal League", short code `NIL`).

Everything hanging off it is keyed by **UUID**, not by name:

| Data | Key | Count for NIL |
|---|---|---|
| League teams (`leagues`) | `association_id` | 28 |
| Rounds (`league_rounds`) | `association_id` | 8 |
| Player registrations (`member_league_registrations`) | `league_id` | 176 |
| Platform members (`platform_league_members`) | `association_id` (platform id) | 216 |
| Platform fixtures (`platform_league_fixtures`) | `association_id` (platform id) | 152 |
| Rules (`league_rules`), affiliations, fees, permissions | `association_id` / `club_id` | UUID-based |

Fixtures, lineups, results, standings and ladder impact all resolve through team ids -> `association_id`. No table stores the league *name* as a join key.

### 2. Is renaming safe?
Yes — renaming is a display-only change, with two caveats to handle in the same change:

- **Keep the abbreviation `NIL`.** The code `NIL` is functionally load-bearing in two places:
  - team codes are `NIL002`, `NIL007`… (`leagues.code`), and `src/lib/leagues/season-level.ts` + `src/pages/Ladder.tsx` derive league level/reserve boundaries from those code numbers;
  - `src/pages/LeagueGames.tsx` has a legacy hard-coded fallback `abbreviation === "NIL"` used only while the club row is still loading to decide whether to hide Fill-Up Leagues. Nelspruit's club/association setting already governs this, so the fallback is cosmetic — but changing the abbreviation would still be riskier than changing the name.
- **Rename the platform mirror too** (`platform_league_associations.name`), otherwise cross-club/federation screens keep showing the old name.

No historical games, standings, statistics, teams, rounds, fixtures, permissions, notifications or reporting break. Already-issued fee/journal descriptions that embedded the old name stay as-is (correct: they are historical records).

### 3. Why admins can't rename or seem unable to add a league
- **Rename is blocked by the UI, not by permissions.** In `LeaguesTab.tsx`'s Edit Association dialog, Name and Abbreviation inputs are `disabled` whenever `platform_association_id` is set ("Name is managed by the platform"). NIL is platform-linked, so both fields are locked. Database RLS *does* allow a club admin to update the row (`is_club_admin_or_permitted(..., 'leagues')`).
- **Creating another league already exists but is easy to miss.** League Setup -> step "League affiliations" -> button "Select your regional league or add your own" -> tab "Create Own" inserts a new `league_associations` row with scope `internal`. The label doesn't read like "create a league", and the button sits next to "Bulk book home fixtures".
- Nothing was deliberately removed.

### 4. Singles vs doubles
There is no singles/doubles field anywhere on the league model. `league_rules` has `games_format` (best-of-N), `team_size`, etc. — nothing describing discipline. Club championships have doubles support, leagues do not.

## Plan

### A. Rename (data)
One migration, two `UPDATE`s by id, no id or relationship changes:
- `league_associations.name` -> `Nelspruit Singles League` (abbreviation stays `NIL`)
- `platform_league_associations.name` -> `Nelspruit Singles League` (short_code stays `NIL`)

### B. Allow admins to edit league display details
In `EditAssociationDialog` (`src/components/club-admin/LeaguesTab.tsx`):
- Unlock **Name** for club-owned leagues, i.e. when `scope === 'internal'` (the club created it) — keep it locked for genuine platform/regional associations the club merely joined.
- Keep **Abbreviation** locked with an explicit hint: "Code is used in team codes (e.g. NIL002) and can't be changed."
- On save of an internal league, also update the linked `platform_league_associations.name` via a small `SECURITY DEFINER` RPC (`rename_internal_league_association`) that authorises with `is_club_admin_or_permitted(auth.uid(), club_id, 'leagues')`, refuses non-internal associations, and never touches `short_code`.

### C. Make "Create New League" obvious
- Relabel the affiliations-step primary button to **"Create New League"** and make the dialog open on the **Create Own** tab by default when the club already has at least one affiliation (joining a regional league stays available on the other tab).
- Add a one-line helper under the heading: "Each league (e.g. Singles, Doubles) has its own teams, rounds and fixtures."

### D. Smallest safe addition for Singles vs Doubles
Add a nullable discipline marker at league level only:
- `ALTER TABLE public.league_associations ADD COLUMN discipline text NOT NULL DEFAULT 'singles' CHECK (discipline IN ('singles','doubles'));`
- Backfill is implicit (all existing rows become `singles`); NIL is correct as-is.
- Surface it as a Singles/Doubles radio in the create + edit association dialogs, and as a small badge next to the league name in League Setup and the League Games association switcher.
- No behaviour change in scoring/fixtures for phase one — it keeps the two leagues visibly and structurally separate, and gives a hook for later doubles-specific lineup rules (2 players per slot) without another migration.

Nelspruit then: Create New League -> "Nelspruit Doubles League", abbreviation e.g. `NDL`, discipline Doubles -> create its teams and rounds under it. Its team codes get their own `NDL…` namespace, so the existing singles code parsing is untouched.

### Verification before hand-off
- Re-query NIL's team/round/registration/fixture counts after the rename and confirm they are unchanged (28 / 8 / 176 / 152).
- Load League Games for Nelspruit and confirm standings, fixtures and history render identically under the new name.
- Create a throwaway internal league in preview, confirm it appears with its own teams area, then delete it.

## Out of scope
No changes to league ids, team ids, codes, results, ladder positions, or RLS strength.
