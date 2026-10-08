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

## 6. Safe remediation (only after your approval)
1. **C:** leave it pending. The club confirms who C is.
   - If C is B: decline C, cancel the R200 with an audited reversal, and give B his own login using the admin "change login email" (it splits a shared login). A stays on Login 1. Nothing is deleted or merged.
   - If C is a new person: approve normally. The R200 stands.
2. **E1:** confirm with Uitsig whether SSA/NSA apply. Post audited reversals for members wrongly charged. For valid charges, create the matching fee lines.
3. **E3:** reconcile with PayFast before any refund.

## 7. Minimal code fix (later, with tests)
- Run the same duplicate check in the sign-up steps **before** the membership row and any joining fee are created. This covers Google and every other path. Match on cell, ID and first + last name, ignoring middle names and "Jnr/Snr".
- If a match is found, show "You're already on the system — is this you?" and offer to claim the existing record. Raise no fee until the person picks "I'm a different person".
- Make the club-side name matcher compare first + last name, so middle names and suffixes don't break it.
- Regression tests:
  - Google sign-up with "Michiel Philip Heyns" against an existing "Michiel Heyns" shows the prompt and creates no row or fee.
  - Choosing "different person" then raises exactly one R200.
  - A family sharing a cell number can still continue.
  - Every path that creates a membership calls the guard (extend the existing source test).

## 8. Existing-member activation with a shared family email
- A contact email may be shared by family members. Each person's login stays unique.
- Activation finds the existing record by name + cell or ID, verifies with an SMS/WhatsApp code to that member's cell, and creates a login only for that member. It never creates a new member row or fees.
- If the login email belongs to a relative, ask for a different login email and keep the shared contact email. The relative's records never move.

Note: the task list was not updated because these turns were read-only.
