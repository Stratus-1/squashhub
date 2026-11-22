# Replace "full admin" with office-bearer permissions

## What "full admin" means today
There are three separate ways someone gets everything in a club:

1. **Club admin status** on the member record. The person can do everything, including setting permissions and all finance. This is how a club's first administrator is created.
2. **A role marked "full admin".** Every club was given Chairman, Secretary and Club Captain roles, all set to full admin, plus a "Full Admin" role at some clubs. Anyone given one of these roles can do everything, including entering, deleting and reversing finance transactions. The only exception is the Chairman role, which is already limited to viewing finance.
3. **The personal "Grant full admin rights" tick** on one member.

Super Admin is separate and stays exactly as it is.

## Who has it now (real clubs, active members)
- **Through a role (Chairman / Secretary / Club Captain / Full Admin):** about 35 people across CSIR, Uitsig, Highveld, Gordons Bay, Durbanville, De Kaap, Meyerton, Irene, Glenwood, CBCTUT and Nelspruit, plus Riverside's test people.
- **Personal full admin tick:** Grant Williams (CSIR), Theo Engelbrecht (Durbanville), Izak Lamprecht (Glenwood), Aam Coetzee (Gordons Bay), Gerhard Fourie (Uitsig).
- **Club admin status:** most of the people above, plus Lamont Lloyd (Highveld treasurer), Hermanus test account, and four St John's committee members.
- **Things that look wrong:** Uitsig and CSIR each have two Chairmen. CSIR also has two Secretaries. The Gordons Bay and Highveld treasurers hold full rights rather than finance rights.

## Proposed default roles (every club; the chairman can adjust later)
| Role | Gets |
|---|---|
| Chairman | Everything, but finance view-only (as now). Can set other people's permissions. |
| Vice-Chairman | Same as Chairman. |
| Treasurer | All of Finance, Fees, Banking, Bar cash-up and reports, Members view, Rules & Documents. |
| Secretary | Club Info, all of Members, Communications, Rules & Documents, AGM and voting, Events, Visitors, Bookings for others, Finance view. |
| Club Captain | Leagues, Ladder, Tournaments, Courts, Events, Ops bookings, Bookings for others, Members view, Communications send. |
| Bar Manager | All of Bar / POS. |

"Full admin" stays available, but nobody receives it automatically any more.

## How we change it safely
1. **Snapshot first.** Every person's current rights are saved, so any one person can be restored with one click.
2. **Review list before anything changes.** You get a list of every person showing their office, what they have now, what they would get, and anything they would lose that they actually used in the last 90 days, such as finance entries, approvals or tournament setup.
3. **Change the role templates** (Chairman, Secretary, Club Captain) to the defaults above, and add Vice-Chairman, Treasurer and Bar Manager where missing.
4. **Move each person** from "Full Admin" or a personal tick onto the role that matches their office, with extra single permissions only where the review shows they need them.
5. **Club admin status:** keep it for one main administrator per club, chosen by you. Everyone else keeps their access through their role. Every club keeps at least one person who can set permissions.
6. **Pilot at Riverside, then CSIR and Uitsig, then the rest**, a club at a time, each after your sign-off.
7. **No messages** to committee members unless you approve them.

## Technical details
- Changes are data updates to `club_permission_roles`, `club_member_permissions` and `club_members.role`, plus `seed_default_permission_roles` for new clubs. A snapshot table holds the earlier rows and drives a restore action.
- Usage evidence for the review comes from the finance audit trail, journal entries, approvals and tournament or bar audit rows.
- Who may set permissions doesn't change: admins and office bearers only, and the chairman can't change his own permissions.
