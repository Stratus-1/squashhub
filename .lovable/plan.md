# Family doubles group entry and payment

## What will change
- Let an invite holder build several exact two-person pairings for one Family Doubles division.
- Allow the invite holder to include themselves in one pair and pair other invited family members together.
- Keep each player in only one active pair within that division.
- Treat the invite holder as the payer for every pair they create; selected partners do not need to approve separately.
- Show all chosen pairs, allow changing/removing them before payment, and display one combined amount for every distinct unpaid family member.

## Payment correction
- Calculate the guest Stitch amount from all unpaid registrations covered by the payer, rather than only one partner.
- For Rachel’s current active pair, the next newly created Stitch payment must be R300.
- When payment succeeds, mark every covered family member’s tournament entry paid and settle each pair once, without double-charging someone included in multiple records.
- Prevent a covered partner from opening a separate R150 payment while another family payer is responsible for that entry.

## Safety and scope
- Preserve tenant and tournament boundaries and verify every selected member is genuinely invited to the same tournament and division.
- Keep ordinary doubles tournaments as one-pair-per-player; enable multi-pair family management only for the Family Doubles flow.
- Do not change recurring payments, webhooks, bar payments, other gateways, tournament withdrawal rules, or unrelated screens.
- Add focused tests, update the issue log, and deploy only the required tournament payment function after verification.

## Technical details
- Add a secure family-pair RPC that accepts two invited member IDs plus the invite token, records the invite holder as payer, and enforces one playing pair per member.
- Update pairing-state and payment-context functions to return multiple managed pairs and count unique unpaid covered registrations.
- Update successful tournament settlement to pay all covered registrations idempotently.
- Extend the invite partner picker into an exact-pair builder for Family Doubles while retaining the existing picker elsewhere.
