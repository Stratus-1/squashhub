# Invitations vs allocation: make "who is invited" and "where they play" behave correctly

Two separate ideas are being confused in the tournament wizard, and one real bug follows from it.

## What is actually happening today

- **Structure ("Players from") is only a label today, not an allocation rule.** Verified in the wizard: when the roster loads, accepted entrants are spread across the leagues with a plain snake draft by list order — the code never looks at which club league each player actually belongs to. That is why Susan Crafford, a League 2 player, landed in League 1.
- **The invitation audience control already exists** in Invites & messaging with three modes (all club members / selected league teams / individuals), and it is already independent from the Structure source. What is missing is that the Structure step still reads "Players from", which makes organisers read it as an invitation restriction.
- Accepted players who belong to no source league are already listed in an "Accepted — needs division assignment" warning, but they are still snake-drafted into some league anyway.

## What to change

### 1. Rename the Structure control so it reads as allocation, not invitation
"Players from" becomes **"Primarily players from"**, with a one-line hint under it:
"This decides which league these players are allocated to and seeded in — it does not limit who is invited."

### 2. Allocate accepted players to the division that matches their real league
Replace the blind snake draft with league-aware seeding:

- For each accepted entrant, look up their actual club league registration.
- If exactly one division names that league in its source, place them there.
- If several divisions could take them, use the first (lowest) matching division.
- Order inside a division stays by ladder position, so seeding is unchanged.
- Manual drag-and-drop placements are still preserved and never overwritten.

### 3. Give league-less acceptors an explicit "Unassigned" home
Players who accepted an open invite but play in none of the source leagues are no longer silently dropped into League 1. They collect in an **Unassigned — needs a league** tray at the top of the Allocate step, from where the organiser drags them into a league (or uses the existing dropdown). They are excluded from the draw until placed, and the existing warning banner links to the tray.

### 4. Make the open-invite option unmistakable in Invites
In Invites & messaging, when the tournament's eligibility is the owning club, the first audience option is stated plainly as **"Invite all members of the club (open invitation)"** with the count, e.g. "all 77 active members", and a note that league sources in Structure do not restrict this list. Selecting a narrower audience keeps the current league-team and individual pickers.

## Technical notes

- Allocation logic goes into `src/lib/tournaments/divisions.ts` as a pure `allocateEntrantsToDivisions()` helper (inputs: accepted entrant ids, `registrationsByLeague`, per-division `leagueSources`, existing manual assignments; outputs: assignment map + unassigned list), so it is testable without the wizard.
- `ClubChampsTab.tsx`: the auto-seed effect (currently a snake draft over `selectedPlayers`) calls the new helper; unassigned ids are held in state and rendered as a drop target in the Allocate step; draw generation already constrains per-division ids via `eligibleIdsForDivision`, so it keeps working.
- Labels: Structure card "Players from" → "Primarily players from"; audience label for `all_club` gains the open-invitation wording and live member count.
- No schema changes — `invite_audience*` columns and the compat view already carry the audience.
- Tests added to `src/test/divisions.test.ts`: single-league match, multi-league member, league-less acceptor goes unassigned, manual placement wins over auto-allocation.
