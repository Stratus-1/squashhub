# Club ⇄ Association (NSA) fees: one connected billing loop

Today the club side and the association side keep two unconnected sets of numbers. The association sets its fee schedule (per member / per club / per league team, per season), but each club has to hand-type the same fees again in its own "Fees Payable Schedule" and guess the member counts. Nothing the club pays flows back to the association's Club Billing view.

This plan connects the two, and makes adding a member later a one-step action that bills correctly.

## 1. Club sees what NSA billed it — no re-typing

New card in Club Admin → Fees, called **Affiliation billing (NSA)**, with a season selector (defaults to the association's declared current season, e.g. 2027).

It shows a live statement built from the association's own fee schedule and the club's submitted roster:

```text
NSA — Season 2027                         Submitted 12 Feb 2027
------------------------------------------------------------
Annual club affiliation      per club     1  x  1 500 =  1 500
League team entry            per team     6  x    850 =  5 100
Player affiliation           per member  48  x    220 = 10 560
------------------------------------------------------------
Total billed by NSA                                     17 160
Paid to date                                            10 000
Outstanding                                              7 160
```

- Counts come from what the club actually submitted for that season (teams and allocated players), so both sides always see the same figure.
- If the club has not submitted yet, the card says so and shows the estimate based on current allocations.
- Renewal date per fee line, taken from the association's schedule.

The existing hand-made "Fees Payable Schedule" stays for non-affiliation payables (other bodies), but affiliation fees that come from a linked association are marked **From NSA — read only** so nobody edits a number the association owns.

## 2. Recording payments, with proof upload

The existing Settle dialog is extended into **Record payment to NSA**:

- amount, date, method (bank/cash), reference
- **upload proof of payment** (PDF or photo) into the existing secure payment-proofs storage
- partial payments allowed; several payments accumulate against the season
- each payment still posts the same double-entry journal it does now, so club finance stays correct

Payment history is listed under the statement with the proof downloadable.

## 3. The association sees those payments

Association Admin → Fees → Club Billing "Paid to date" and "O/s balance" switch to reading these club→association payments (right now they read member-level fee payments, which is the wrong source). The association can open a club row and see each payment, its reference, and the uploaded proof, and mark it **confirmed / disputed**. Confirmation is what the club sees as "received by NSA".

## 4. Adding a member later — two routes, both bill correctly

**Route A — from the Members page (quick).** Tick "Affiliated to NSA" on a member. A small prompt appears: *"Which team should they play for?"* with the club's teams for the current season (or "No team yet"). On save the system:
- creates the active affiliation,
- adds them to the chosen team's roster,
- submits them to NSA as an addition to the already-submitted roster,
- adds their per-member fee to the season's billed total (shown as a new line on the statement).

**Route B — from Leagues (bulk).** Unchanged: allocate players to teams, then **Submit new teams or added players to NSA**. Newly submitted players are added to the billed total the same way.

Either way a member is only ever billed once per season, and removing a member before submission does not bill them.

## Technical notes

- New table `club_association_payments` (club_id, association_club_id, season_year, amount, paid_on, method, reference, proof_path, status pending/confirmed/disputed) with GRANTs + RLS: club finance admins write their own club's rows, association admins read/confirm rows addressed to them.
- New security-definer RPC `club_association_statement(_club_id, _season_year)` returning fee lines with counts derived from submitted teams/roster, plus totals paid — one source of truth used by both the club card and the association Club Billing table.
- Proof files go to the existing `payment-proofs` bucket under `<club_id>/assoc/<season>/…`; storage policies extended to allow the owning association to read.
- `club_submit_association_roster` gains an "add member" path so Route A can submit a single player without re-submitting the whole roster.
- Files touched: `AssociationPayablesPanel.tsx`, `FeesPayableSchedule.tsx`, `FeesTab.tsx`, `AssociationFeesTab.tsx`, `MembersTab.tsx`, plus one migration.
