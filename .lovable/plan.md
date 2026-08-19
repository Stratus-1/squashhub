# One roster: make the Players step the single place to manage participants

Today a tournament's people live in two tables and are managed in two places. `club_champs_registrations` holds the entry workflow (invite, accept, payment, proof of payment, partner). `club_champs_entries` holds the confirmed roster with group/order placement. The wizard's Players step reads and rewrites entries; the separate **Registrations** button opens a second dialog that edits registrations. The two can disagree — the live database currently has 365 non-cancelled registrations with no matching entry row, and 51 entry rows with no registration row.

The fix is a read model, not a schema rewrite: derive one participant list from both tables, render it in the Players step, and let every admin action write to the right table underneath.

## 1. The two state axes

Participation status (never derived from money):

| State | Meaning |
| --- | --- |
| `invited` | Organiser invited them; player has not responded |
| `pending_approval` | Player/team manager entered; organiser must accept |
| `confirmed` | On the roster; counts for draws, groups and scheduling |
| `declined` | Player turned the invitation down |
| `withdrawn` | Was in, then pulled out or was removed by the organiser |

Payment status (only shown when the tournament charges a fee):

| State | Meaning |
| --- | --- |
| `not_required` | Free tournament — column hidden |
| `unpaid` | Fee owed, nothing received |
| `pending_card` | Card checkout started, not settled |
| `pending_eft` | EFT claimed; proof may be attached and needs review |
| `paid` | Settled |
| `waived` | Organiser waived the fee |

Plus two display-only flags already available: **on the draw** (has an entries row with a group) and **account activated** (from `get_champ_signup_status`).

## 2. How today's data maps in

`club_champs_registrations.status` is currently doing both jobs. Mapping (read-only, no data migration):

| Legacy row | Participation | Payment |
| --- | --- | --- |
| `paid` | `confirmed` | `paid` if fee > 0, else `not_required` |
| `waived` | `confirmed` | `waived` |
| `invited` | `invited` | `unpaid` |
| `pending_payment`, `confirmed_at` null, `invited_by_admin` true | `invited` | `unpaid` |
| `pending_payment`, `confirmed_at` set | `confirmed` | `pending_card` |
| `pending_eft` | `confirmed` | `pending_eft` |
| `cancelled`, `confirmed_at` set | `withdrawn` | unchanged |
| `cancelled`, never confirmed, was invited | `declined` | n/a |
| entry row with no registration row | `confirmed` | `not_required` |

Approval-gated tournaments (`approval_gate = 'admin_accept'` with self entry) read `pending_payment` + no `confirmed_at` as `pending_approval` instead of `invited`.

One additive, non-destructive migration adds nullable `participation_status` and `withdrawn_at` to `club_champs_registrations`, backfilled with the mapping above. The legacy `status` column keeps being written exactly as it is today so payment webhooks, `accept_tournament_invite`, notification triggers and the invite dialog keep working untouched.

## 3. When someone joins the roster

A registration row is created the moment anyone enters — admin pick, self sign-up, team-manager entry or invite. An **entries** row (the draw seat) is created only when participation reaches `confirmed` and the organiser is placing people into groups or pairs. That keeps draw generation on the same data it uses now and avoids half-registered players silently appearing in a draw.

If the tournament requires payment before play, `confirmed` is still reached on acceptance; the unpaid state is shown as a warning badge and can optionally block draw placement — surfaced as a checkbox, not a hidden rule.

## 4. What the Players step becomes

One table, everyone in it, whatever route they arrived by:

```text
Player            Participation      Payment        Partner    Group
Willem P.         Confirmed          Paid           Deidre     A
Sarah M.          Pending approval   Pending EFT*   —          —
Johan K.          Invited            Unpaid         —          —
Chris L.          Declined           —              —          —
```

- Filter chips across the top: All / Confirmed / Awaiting response / Needs approval / Payment outstanding / Out.
- Row actions by state: Approve, Reject, Mark paid, Waive fee, View proof, Remove/Withdraw, Re-invite, Set partner.
- Bulk actions on selection: approve, mark paid, waive, remove, invite.
- The existing "add players" picker stays and becomes the *admin entry* path; picking a member creates a confirmed registration exactly as it does now.
- Group/pair assignment stays where it is; the roster table is the source of who is eligible to be placed.
- Counters at the top: confirmed, awaiting, unpaid, on the draw.

Behaviour per flow: admin-selected players appear instantly as Confirmed; self-registered appear as Pending approval or Confirmed depending on the approval gate; invited appear as Invited and flip to Confirmed or Declined on their response.

## 5. The Registrations dialog

Keep it in place for the first release, so nothing regresses while the merged table is exercised on a live tournament. Once the Players step covers approve/reject, mark paid, waive, proof viewing, partner override and cancel — all of which the current dialog does — replace the tournament-card button with **Players**, which opens the wizard directly on that step. The dialog file gets deleted in a follow-up, not in this change. Entries lock/unlock, currently only in that dialog, moves onto the Players step header.

Governance stays exactly where it is — no participant controls move into it, no governance controls move out.

## 6. Risks

- **Doubles pairing** is the most delicate area: `syncDoublesRegistrationsForPairs` rewrites registration rows from pairs, and self-pairing writes partners from the player side. The merged view must never let a roster edit clear a player-confirmed partner. Pair edits keep going through the existing sync helper only.
- **Destructive re-writes**: `saveEntriesDraft` currently deletes all entries for a tournament and re-inserts. That behaviour is kept as-is, but the roster read model must not depend on entries surviving between saves.
- **Legacy `paid` overload**: 365 rows are `paid` including free tournaments. The mapping treats `paid` on a zero-fee tournament as `not_required`, so free events won't display misleading "Paid" badges.
- **Live tournaments**: mapping is read-only and the backfill is additive, so an in-progress tournament sees the same roster it has now, just labelled more precisely.
- **Notification triggers** fire on `invited_by_admin` INSERT. New roster actions must follow the existing rule: allocation never sets that flag, only an explicit invite does.

## Technical notes

- New `src/lib/tournament-roster.ts`: `deriveParticipant(reg, entry, champ, governance)` returning `{ participation, payment, onDraw, activated }`, plus `mapLegacyStatus`.
- New `useTournamentRoster(champId)` hook: single query joining registrations + entries + `get_champ_signup_status`, keyed so existing `champ-registrations` invalidations also refresh it.
- New `TournamentRosterTable` component rendered inside the Players step's WizardSection; action mutations mirror the ones in `TournamentRegistrationsDialog` so semantics are identical.
- Migration: `alter table club_champs_registrations add column participation_status text, add column withdrawn_at timestamptz;` plus a backfill update. No drops, no constraint changes, no RLS changes.
