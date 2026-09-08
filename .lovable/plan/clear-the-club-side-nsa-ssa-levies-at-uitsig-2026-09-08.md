# Clear the club-side NSA / SSA levies at Uitsig

The 23 Uitsig members created on 30 August each carry two "fees payable by the club" lines for 2026: Northern Squash Association R160 and Squash South Africa R300 (46 rows in total). Nobody else on the roster has them, so the display is inconsistent.

## What will change

- Remove all 46 club-payable levy rows (NSA R160 and SSA R300, season 2026) for Uitsig members.
- The "Fees payable by the club" line then disappears from every Uitsig member card, so the roster reads consistently.
- These levies get created again the proper way when the club submits its 2026/2027 roster to NSA — that flow bills the members who are actually affiliated.

## What will not change

- Fees payable **by the member** are untouched, including the R100 imported opening balance.
- NSA affiliation records and NSF numbers stay exactly as they are.
- No other club is affected.

## Technical notes

Data-only change, no schema or code edit. Delete from `club_member_fee_payments` where `club_member_id` belongs to club `d8397b8a-60d3-4c4b-afee-25dab218bf19`, `is_pass_through = true`, and `fee_type` in (`club_payable_assoc`, `club_payable_national`). Row count before delete is 46; a count check runs after to confirm zero remain. Any `linked_fee_payment_id` references from member-side rows are already null for these records.
