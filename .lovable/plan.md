# Uitsig Heyns + member fee forensic findings (read-only) and safe remediation

Read-only queries against the live database. Nothing was changed, approved, merged, reversed or sent.

## 1. The three Michiel records (Uitsig)

| Record | Number | Category | Login | Person record | Status | Created |
|---|---|---|---|---|---|---|
| A "Michiel Jnr Heyns" | UITS3543 | Scholar | Login 1 | Person P1 | Active | 6 May 2026 (import) |
| B "Michiel Heyns" | UITS2970 | Premium | Login 1 (shared with A) | Person P2 | Active | 30 Aug 2026 07:04 (bulk import) |
| C "Michiel Philip Heyns" | none | none | Login 2 (own) | Person P3 | **Pending** | 7 Oct 2026 15:42 (self-signup) |

- Login 1 created 6 Oct 2026; Login 2 created 7 Oct 2026 15:40. Both use different gmail addresses starting "mic…" (masked).
- **The application was NOT approved.** C is still pending, has no member number and no category. No approval audit row exists.
- No email-change audit record exists for any Heyns row, so it cannot be confirmed when or by whom A/B were attached to Login 1.
- Three separate person records exist. C is very likely the father, who is already B (UITS2970). This means a likely **duplicate person and membership** for the father. That comes from the self-signup, not from approval or an email edit. It is unconfirmed until the club checks ID numbers/date of birth.
- The signup created one charge: **R200 Registration for C, unpaid**. It is in the ledger (debtors R200 / membership income). If C is a duplicate of B, this charge is wrong.

## 2. Where the R460 on Michiel Heyns (B) comes from

- R300 "Fee raised: Squash South Africa (SSA)" + R160 "Fee raised: Northern Squash Association" were posted to the ledger on 30 Aug 2026 at 07:04, the same second B was created.
- This is the federation/league fee seeding that ran during the 30 Aug bulk import. It was not caused by signup, approval, activation or an email edit.
- No matching member fee rows exist (0 of these postings link to a fee line). The amounts show on the member card and the debtors ledger, but members cannot see them as payable fee items or mark them paid.

## 3. Club-wide exceptions (anonymised)

| # | Source | When | Members | Amount each | Total | Assessment |
|---|---|---|---|---|---|---|
| E1 | Import seeding SSA + NSA postings, no fee lines | 30 Aug 2026 07:04–07:05 | 23 | R460 | R10,580 net debt | **Likely erroneous.** No fee lines. 16 of 23 have no login. Only 11 of 23 have a league affiliation, but SSA should only be charged to members with a league number. The rule says default seeded fees are auto-marked PAID. |
| E2 | Self-signup Registration | 7 Oct 2026 | 1 (C) | R200 | R200 | Valid in itself, but wrong if C is a duplicate of B |
| E3 | Wallet top-up R20 posted twice (PayFast), one member | 18 Sep 2026 12:17 and 12:38 | 1 | R20 | R20 possibly extra | Two separate gateway-fee entries suggest two real payments. Check against PayFast before acting. |

- No scheduled-billing, manual-journal or reversal postings to members exist in the last 45 days apart from these.
- Club totals: 247 members, 18 with no category, 1 pending.

## 4. What could not be verified
- Who ran the 30 Aug import (no actor in the audit trail).
- When and how Login 1 got attached to both A and B.
- Whether C is truly the father (needs ID/date of birth checked by the club).
- PayFast settlement for E3.

## 5. Safe remediation (only with your approval; nothing done yet)
1. **C (pending):** keep it pending. The club confirms identity. If C is the father, do not approve it: void the R200 with a reversing journal, then decline C. Then give B its own login (Login 2's email) using the existing admin "change login email", which splits a shared login. A stays on Login 1. Do not merge or delete anything until you approve.
2. **E1 (23 × R460):** first confirm with Uitsig whether SSA/NSA should apply. For members who should not be charged, post audited reversing journals (never delete). For members who should, create matching fee lines so the charges are visible and payable. List the 23 privately to the club admin.
3. **E3:** check against the PayFast record. Only refund or reverse if just one payment actually settled.
4. **Prevention (code, later):** seeding must only charge league-affiliated members, must always create a fee line with each posting, and must be logged with the actor.

## 6. Existing-member activation with a shared family email
- Keep each member's contact email separate from their login. Family members may share a contact email.
- Activation searches for existing members by name + cell + ID/date of birth before creating a new record. On a match it offers "This is me — activate" with a code sent by SMS/WhatsApp to that member's cell. It then creates a new, unique login for that member only and never adds a new member row or fees.
- If the login email is already used by a relative, ask for a different login email and keep the shared contact email. Never move the relative's rows.
- The admin "change login email" stays the only way to split logins, and it is audited.

Note: the task list file was not updated because this was a read-only turn.
