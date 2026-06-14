## NSC Doubles Fun-Raiser — merge + reconciliation (updated with Yoco)

Single sequence, data-only, no schema changes.

### Step 1 — Merge JP Lategan duplicate
Source `959901ba…` (NSC338) → Target `83908fa6…` (NSC183).
- Enumerate every FK to `club_members` via `information_schema`, repoint NSC338 → NSC183 in one batch (fees, registrations, journal, league regs, affiliations, bookings, matches, notifications, permissions, ladder history, feed, challenges, etc.).
- Copy `user_id` from NSC338 → NSC183.
- DELETE NSC338. NSC183 keeps `ladder_position=113`; position 202 vanishes (no reshuffle).

### Step 2 — Bill outstanding R150 entry fees (date 2026-06-06)
For each roster player who does NOT already have `fee_payment_id`, and excluding JP Lategan (did not play):
- INSERT `club_member_fee_payments` (R150, outstanding, "NSC Doubles FUN-Raiser entry").
- INSERT `club_journal_entries`: DR Members debtors 150 / CR Tournament income 150.
- UPDATE registration `fee_payment_id` to link.

Already-linked (skip billing): Sherique Crafford, Raymond Gates, Vian Crafford, Rachel Gates, Josh Crafford.

### Step 3 — Apply Yoco payments (5 rows)

| Yoco payer | Amount | Allocation |
|---|---|---|
| Rachel Gates | R150 | mark her R150 entry fee paid |
| Raymond Gates | R150 | mark his R150 entry fee paid |
| Sherique Crafford | R150 | mark her R150 entry fee paid |
| Vian Crafford | R190 | R150 entry paid + **R40 surplus → Tournament income (donation)** |
| Josh Crafford | R190 | R150 entry paid + **R40 surplus → Tournament income (donation)** |

For each: mark fee row paid (paid_at = Yoco date); journal DR Bank / CR Members debtors 150. Surpluses (2 × R40 = R80) journaled DR Bank 40 / CR Tournament income 40 each.

### Step 4 — Apply EFT payments

| Ref | Amount | Allocation |
|---|---|---|
| ALEX & JESS KNOTT | R300 | Alex + Jessica Knott |
| ABSA C&H OPPERMAN | R300 | Charmony + Hannes Opperman |
| ARMANDT VISSER | R150 | Armandt Visser |
| DBLSFUNDRAISERPUCKY | R150 | Glen Paterson (NSC189) |
| JK DOUBLES FUN | R300 | Jason + Jacques Knoetze |
| SUHAIL PACKERY | R150 | Suhayl Packary |
| WYNAND KLAVER | R150 | Wynand Klaver |
| CHANYA GATES | R150 | Chanya Gates |
| SUE | R150 | Susan Crafford |
| JP LATEGAN | R150 | NSC183 — wash (credit + refund same day) |
| ROEDOLF VAN WYK | R150 | Roedolf van Wyk |
| BAMANYE NTONJANE | R150 | Bamanye Ntonjane |
| TIAN LOUW | R150 | Tian Louw |
| JOHANN RADEMEYER | R150 | Johann Rademeyer |
| QUINTIN TALJARD | R150 | Quintin Taljard |
| LEZANI SLEEPERS | R150 | Lezani Slippers |
| ABSA HOLING DOUBLES | R450 | Matthew + Douglas Peter + Leigh Holing |
| LUCAS E DOUBLES TOUR | R300 | Lucas Esterhuizen R150 entry + R150 → Tournament income (son withdrew, kept as donation) |
| SIMON DOUBLES FUN | R150 | Simon Riekert |

Each payment: mark fee paid (paid_at = EFT date); journal DR Bank / CR Members debtors. Lucas/Lategan extras as noted.

### Step 5 — Held / excluded
- JOVAN VAN VUUREN R90 — tuck-shop, not posted.
- "RENIER DUBBELS 06/06-0004" R150 — awaiting your decision (Renier van Rensburg vs other).

### Step 6 — Return fresh "still owing" roster after batch.

I'll surface the merge SQL and reconciliation SQL via the insert tool for your approval before they execute.
