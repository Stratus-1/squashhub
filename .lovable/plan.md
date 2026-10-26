# Uitsig AGM committee voting (secret ballot)

A one-off ballot campaign: every eligible Uitsig member gets a personal voting link, casts one vote per position, and only admins see the results — without ever seeing who voted for whom.

## Ballot (from the nomination sheet, grey = declined)
Please confirm before it goes out:

- **Chairperson:** Bradley Hunt, Reinhardt Falke
- **Vice Chairperson:** Kaylee Hunt, Mark Schickerling, Reinhardt Falke, Zelda Coetzee
- **Club Manager:** Berdina Esterhuizen (Kiosk), Deon Groenewald, Wynand Ras (Maintenance)
- **Treasurer:** Bradley Hunt, Deon Groenewald, Hanno Kamfer, Kaylee Hunt
- **General Member:** Carel Ras, Gerhard Fourie, Jannie Goosen, Johann du Randt, Kaylee Hunt, Kelsey Cousins, Marnus Kamfer, Maryna, Siyanda Dyeshena, Yolanda Coetsee

Removed as declined: Brett Cousins, Duane Rossouw (all positions), Deon Groenewald (Chair), Gerhard Fourie and Jannie Goosen (Vice).
One choice per position (or abstain). Nominees standing for several positions appear in each.

## How your five rules are met
1. **Eligible, paid-up only** — adult members (18+) whose current annual membership fee is marked paid when the ballot opens. Admin sees the voter list and count before sending; juniors and unpaid members get no link.
2. **One vote each** — each voter gets one personal link (works in or out of the app). Once used it can't be used again; a second attempt shows "You have already voted".
3. **Locked after deadline** — votes are final once submitted; after the deadline (e.g. Thu before the AGM) the ballot closes and no link works.
4. **Confidential** — the system records *that* a member voted separately from *what* was chosen. Ballots have no member name attached, so not even admins can link a choice to a person.
5. **Verifiable** — each voter receives a private receipt code after voting. At the AGM the results page shows totals per position, turnout (voted / eligible), and the full list of anonymous receipt codes with their choices, so any member can check their own vote was counted, and totals can be recounted by anyone. A printable/PDF result sheet for the AGM.

## Voter verification step (before the ballot)
Matches the Google Form section, but filled in from the personal link so members can't mistype:
- Full name and surname, membership number and registered email shown pre-filled and read-only (checked against the club's member record, not typed).
- Required checkbox: "I confirm that I am a paid-up member of Uitsig Squash Club, aged 18 years or older, and entitled to vote in accordance with the Club Constitution. I confirm that I will submit only one ballot."
- The ballot only opens after ticking it. The declaration is stored with the "has voted" record, never with the choices.

## Admin screens (Communications)
- **Create ballot:** positions, nominees, deadline, eligibility preview.
- **Send:** via the existing Communications campaign (email + in-app; WhatsApp only if switched on), with a reminder option.
- **Live turnout** while open (count only, no results) — results unlock after the deadline, admin-only.
- **Results:** per-position tallies, winner, turnout, receipt list, print.

## Technical notes
- New tables: ballots, ballot positions/candidates, voter tokens (member + hashed token + used_at), ballot votes (no member reference; random receipt). Club-scoped RLS; members never read tables directly.
- Vote submission through one secured function that checks token, deadline and unused status, marks the token used and inserts votes in one transaction (no duplicates even on double-tap).
- Eligibility snapshot taken when the ballot opens, using the existing fee-paid data and member age.
- Results function only returns aggregates after close, to club admins.
- Tests: ineligible blocked, one vote only, post-deadline rejected, no member link stored with votes, tallies correct.
- Not published until you approve after a test ballot on fictional data.
