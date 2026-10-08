# Uitsig Heyns: what happened with the signup and the fees (read-only findings) + safe fix

These findings come from read-only checks of the live records and code. Nothing was changed, approved, merged, reversed or sent.

## 1. The three Michiel records (Uitsig)

| Record | Number | Category | Login | Person record | ID number on file | Status | Created |
|---|---|---|---|---|---|---|---|
| A "Michiel Jnr Heyns" | UITS3543 | Scholar | Login 1 | P1 | none | Active | 6 May 2026 (import) |
| B "Michiel Heyns" | UITS2970 | Premium | Login 1 (shared with A) | P2 | yes | Active | 30 Aug 2026 (bulk import) |
| C "Michiel Philip Heyns" | none | none | Login 2 (Google, own) | P3 (new) | yes, **different from B** | **Pending** | 7 Oct 2026 15:42 |

- **The application has not been approved.** C is still pending, with no member number and no category. There is no approval record.
- There is no email-change record for any Heyns row. When and by whom A and B were put on Login 1 cannot be confirmed.
- C's cell number matches neither A nor B. C's ID number is different from B's. So the records do **not** prove C is the father (B). C could be a third person, or one ID could be mistyped. The club must check this.

## 2. Why the "Is this you?" check did not appear (evidence-based)

How the signup ran, from the records:
1. 15:40:27 – a Google login was created (sign-up through Google, not the email form).
2. 15:42:28 – the person saved the sign-up steps. The membership row was created directly from those steps, and the system marked it as a self-application.
3. 15:42:29 – one second later, the same save raised the **R200 Registration** fee and posted it to the ledger.

Root cause:
- The duplicate check ("We may already have an account for you") only runs on the **email/password sign-up form**, the visitor forms and the "no club" screen. The **Google sign-up → sign-up steps** path has no duplicate check. It creates the membership and the fee directly.
- The backend has **no record of the duplicate check being called** from 1 Oct onwards, and no recovery codes were sent on 7 Oct. This fits the check never running. It is not a case of the person skipping the prompt.
- The only check inside the sign-up steps is an ID-number match. C's ID differs from B's, so it passed.
- Even where the check does run, a name-only match is shown as a soft "possible" prompt with "I'm a different person — continue". The club-side matcher also requires an exact full name, so "Michiel Philip Heyns" would never equal "Michiel Heyns" there. (The platform matcher does compare first + last name, so it would have matched.)
- So: the matcher did not fail. This route skipped it. The middle name would also have defeated the in-steps matcher.

**Was the R200 raised before any identity check?** Yes. It was raised in the same save that created the membership, with only the ID-number check before it.

## 3. Where the R460 on Michiel Heyns (B) comes from
- R300 "Squash South Africa (SSA)" + R160 "Northern Squash Association" were posted on 30 Aug 2026 at 07:04, the same second B was imported.
- Cause: fee seeding during the bulk import. Not signup, approval, activation or an email edit.
- No matching member fee lines exist, so these charges cannot be paid or marked paid as normal fee items.

## 4. Club-wide exceptions (anonymised)

| # | Source | When | Members | Each | Total | Assessment |
|---|---|---|---|---|---|---|
| E1 | Import seeding SSA + NSA, ledger only, no fee lines | 30 Aug 2026 07:04–07:05 | 23 | R460 | R10,580 | **Likely erroneous.** 16 have no login; only 11 have a league number; the rules say seeded defaults are auto-paid and SSA only applies to league players |
| E2 | Sign-up steps Registration fee (C) | 7 Oct 2026 | 1 | R200 | R200 | Valid if C is a genuinely new person; wrong if C is B |
| E3 | R20 wallet top-up posted twice (PayFast), one member | 18 Sep 2026 | 1 | R20 | R20 possibly extra | Two separate gateway fees suggest two real payments; check against PayFast |

There were no other member charges from scheduled billing, manual journals or reversals in the last 45 days. Uitsig has 247 members: 18 have no category and 1 is pending.

## 5. What cannot be verified
- Who ran the 30 Aug import (no actor recorded).
- How Login 1 came to hold both A and B.
- Whether C is B, A or a third Heyns. The ID numbers differ, so the club must confirm in person.
- PayFast settlement for E3.
- Whether the person saw any prompt. No check call was logged, but backend log retention may be limited.

## 6. Status: what is done vs planned
- **Done:** the read-only investigation above.
- **Not done (planned, waiting for your approval):** everything below. No records, charges, logins or code have been changed.

## 7. Requested clean-up (planned)

**(a) Clear the 23 wrong SSA/NSA charges (R10,580).**
- For each of the 23 members, post an audited reversing ledger entry against the original 30 Aug posting: debtors credited, league fee income debited, with a link back to the original entry. Nothing is deleted.
- Record one audit event per member with the reason "Erroneous SSA/NSA seeding at import 30 Aug 2026", the actor and the amounts.
- Club membership, registration and other legitimate fees stay untouched. Only the 46 SSA/NSA postings from 30 Aug 07:04–07:05 are reversed.
- Afterwards, check that each of the 23 members' balances fell by exactly R460, that the club total fell by R10,580, and that no other postings changed.

**(b) R200 Registration on the pending signup (C).**
- Reverse it with an audited entry **only after** C is positively confirmed as an existing member (see the blocker below). If C turns out to be a new person, the R200 stands.

**(c) Fold the new signup into the original Michiel Heyns (B) membership.**
- **Safety blocker:** C's ID number and cell differ from B's. Nothing moves until identity is positively confirmed, either by the club admin checking ID in person or by a code sent to B's cell number on file. If it isn't confirmed, nothing changes.
- **Never** combine Michiel Jnr Heyns (A) with his father. A keeps Login 1, his number UITS3543, his Scholar category and his history.
- Once confirmed, use a supported **"Resolve duplicate / claim existing membership"** action (new, admin-only, audited). It will:
  1. Move C's own login (Login 2) and the confirmed new contact details onto B. B keeps UITS2970, Premium, rankings, ladder and history. Updating B's ID number or cell also needs the admin to confirm which value is correct.
  2. Take B off the shared Login 1 (A stays on it).
  3. Close C as "resolved: duplicate of UITS2970". This is neither an approval nor a decline. C is kept for audit, not deleted, and the duplicate person record is marked as merged into B's.
  4. Reverse C's R200 as in (b).
  5. Write one audit event with before/after details, the actor and the verification method.

## 8. Prevention (planned code changes, with tests)

**(d) Recognise existing members on every sign-up path, before any fee.**
- Google, Apple and email sign-ups all run the existing-member check inside the sign-up steps, **before** a membership row or any joining fee is created.
- Matching: cell, ID number, and first + last name with middle names and "Jnr/Snr" ignored.
- When several people match (e.g. father and son), list them with masked details (number, category, age group) so the person picks the right one, or chooses "None of these — I'm new".
- Claiming an existing record needs a code sent to that record's cell, or admin confirmation. No fee is raised until "I'm new" is chosen.
- Tests:
  - Google sign-up as "Michiel Philip Heyns" shows both Heyns matches and creates no row or fee.
  - Choosing "new" raises exactly one R200.
  - A family sharing a cell can continue.
  - Every path that creates a membership calls the check.

**(e) SSA/NSA fees only on formal league-season submission.**
- Import, joining, activation and approval never raise SSA/NSA.
- These fees are raised only when a member is formally submitted for a league season, at most once per eligible member per season. A duplicate submission is ignored rather than charged twice.
- Every SSA/NSA charge always creates a payable fee line together with its ledger entry.
- Tests:
  - An import creates no SSA/NSA.
  - A season submission charges once.
  - Re-submitting doesn't charge again.
  - A member without a league number isn't charged.

## 9. Other items
- **E3 (possible double R20 top-up):** reconcile with PayFast before any action.
- **Shared family email:** the contact email may be shared; each person's login stays unique and is claimed only through a code to their own cell.

Note: the task list was not updated because these turns were read-only.
