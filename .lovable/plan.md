# One tournament platform for club, association and federation

Today a tournament is one very wide `club_champs` row (78 columns) that mixes three different concerns — who governs the event, what rules it is played under, and how it actually runs — and it is hard-wired to a single club. This refactor keeps **one engine** and splits the concerns.

## Target shape

```text
tournament (engine: draws, scheduling, scoring, entries)
  owner_org_id  -> organisations (club | association | national)
  |
  +-- governance   1:1  ownership, sanctioning, eligibility, entry dates,
  |                     entry fee + federation/association/club split,
  |                     refunds, payment settings, audit trail
  +-- rules        1:1  scoring format, draw type, standard of play,
  |                     best-of, points per game, handicap, byes
  +-- venues       1:N  host clubs, courts, host compensation
```

Nothing about draws, scheduling, scoring or entries is duplicated — the existing engine (`club_champs_entries`, `club_champs_matches`, `club_champs_registrations`, scheduler, formats registry) is reused unchanged at every level.

## What changes

### 1. Data model (one migration)
- Add `owner_org_id` to the tournament row; backfill from each club's organisation. `club_id` stays as the default host venue only.
- New `tournament_governance` (one row per tournament): sanction status/authority/reference/notes, competition level, eligibility (age, licence, scope, notes), registration opens/closes, entry fee, federation share, association share, refund policy and cut-off, payment methods/required.
- New `tournament_rules` (one row per tournament): scoring format, draw type (round robin, groups + playoffs, Swiss, knockout), standard of play, best-of, points per game, win condition, handicap settings, bye handling, play-all-games.
- New `tournament_venues`: host club, courts, and host compensation (fixed amount or percentage of entries played there).
- Backfill both tables from the existing columns, then **drop the moved columns** from `club_champs` so there is a single home for each field.
- Re-point `tournament_governance_audit` at the governance table so the audit trail survives.
- Permission function `can_manage_tournament(tournament_id)` — club admins for club-owned events, association/federation officers (existing recursive org roles) for events they own. RLS on all three new tables uses it; reads stay open to anyone who can see the tournament.

### 2. Shared engine layer (frontend)
- `src/lib/tournaments/` becomes the single home for tournament types and helpers; the format registry stays where it is and is reused.
- `src/hooks/use-tournaments.ts`: owner-scoped list/create/update, plus `useTournamentGovernance`, `useTournamentRules`, `useTournamentVenues` — one set of hooks used by every level.
- `use-tournament-governance.ts` is rewritten to read the governance table instead of the wide row.

### 3. UI
- Governance dialog gains a **Venues & host compensation** tab and an **Ownership** field (which body runs the event); fee split preview shows federation / association / host club / owner club.
- New **Rules** dialog carved out of the wizard: scoring format, draw type, standard of play, scoring detail. The wizard keeps only operational steps (entries, courts, dates, generation).
- The existing tournaments panel is made owner-agnostic and mounted in three places: club admin (owner = club), Association dashboard (owner = association), Super Admin → Federation (owner = national body). Same component, same engine, permissions come from the owner level.

### 4. Fee flow
Entry payments split by the governance shares: federation share → federation payable, association share → `association_payable`, host compensation → host club, remainder → owning body. Reuses the existing payable/ledger plumbing.

## Sequencing
1. Migration + backfill + permissions (approval required).
2. Shared hooks and engine module, governance/rules dialogs updated.
3. Wizard slimmed to operations; rules extracted.
4. Association and Federation mounting; fee-split posting.

Existing tournaments keep working throughout — every field is backfilled before the old columns are dropped.
