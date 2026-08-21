# Nelspruit: multi-division entry + self-scheduled matches

## The answer to your question

Do **not** build a separate tournament (or a separate "structure") per class. Build **one tournament** that holds several **competition divisions** — that is exactly what divisions already are in SquashHub:

```text
Nelspruit Club Champs 2026
├── Division: League 1        (format, pools, rules, winner)
├── Division: League 2
├── Division: League 3
├── Division: League 4
├── Division: Ladies
└── Division: Junior Boys
```

Each division keeps its own format, pool count, gender category, scoring rules and its own winner. "Sections" is only legacy wording for a knockout split into sub-draws — it is not the right home for League 1 / Ladies / Junior Boys, so we keep divisions as the class concept and just make them **nameable** and **multi-selectable at registration**.

Overall tournament-wide rules (entry fee, play-by deadline, scoring default) stay at the tournament level; anything a class needs to differ on is overridden on the division.

## What changes

### 1. Divisions become properly named classes
- Division cards get a free-text **name** (League 1, Ladies, Junior Boys…) instead of only "League N". The existing `group_labels` map already stores this — surface it on the Structure card and use it everywhere (invite text, draws, standings, marker).
- Each division keeps its own format/pools/category as today. Nothing about seeding or draw generation changes.

### 2. A player may enter more than one division
Today a registration is one row per person, and division placement is a single `group_number` on the entry row.

- Registration gains a **list of chosen divisions** (`division_choices`), captured on the public invite page.
- Acceptance creates **one entry row per chosen division** (the entries table already supports several rows per member — nothing structural to break).
- Draw generation, standings and the marker are already keyed on `group_number`, so a player simply appears in each of their divisions' draws.
- Guards: a player cannot be drawn against themselves; capacity counts each entry, not each person; the entrant list shows "Piet — League 1, Junior Boys".

### 3. The invite/registration page asks which divisions
- The email lists the available divisions with their format and any entry fee.
- The public invite page shows a checkbox list of divisions the person is **eligible** for (gender/age category and, where the organiser restricted it, source league). They tick one or more, then accept.
- Anyone who ticks nothing, or is eligible for nothing, still lands in the existing **Unassigned / needs division** state for the organiser to place by hand.

### 4. Self-scheduled matches — no court booking
- Tournament-level toggle: **Scheduling = Club-scheduled (courts booked)** or **Players arrange their own games**.
- With self-scheduling on:
  - The wizard stops asking for courts/time slots and skips the capacity check and all court-booking writes.
  - Instead the organiser sets a **play-by window** per round/phase (e.g. "Round 1 must be played by 15 March").
  - Matches are created unscheduled with a `play_by` date; players see "Play before 15 Mar" on their fixture, can agree a date between themselves, and record the result through the normal marker.
  - Overdue matches surface to the organiser with the existing forfeit/walkover action.

## Technical notes

- `club_champs_registrations`: add `division_choices int[]` (chosen `group_number`s), populated by the public invite RPC.
- `club_champs_entries`: already `(champ_id, club_member_id, group_number)` — allow multiple rows per member; add a uniqueness constraint on the triple.
- `club_champs`: add `scheduling_mode text` ('club' | 'self') and `round_play_by jsonb` (round/phase → date).
- `club_champs_matches`: add `play_by date`; leave `scheduled_date/time/court_id` null for self-scheduled draws.
- Invite RPCs (`get_tournament_invite`, `respond_tournament_invite_public`, `accept_tournament_invite`) return the eligible division list and accept the chosen ids.
- UI touch points: `ClubChampsTab.tsx` (Structure + Dates step), `TournamentInvite.tsx`, `CapacityCheck.tsx` (hidden when self-scheduled), `divisions.ts` (multi-division helpers), plus tests in `src/test/`.

## Order of work
1. Named divisions on the Structure card.
2. Multi-division registration (schema + invite page + acceptance → multiple entries).
3. Entrant/draw UI showing multi-division players; guards and capacity.
4. Self-scheduling mode with play-by windows and the court-booking bypass.
