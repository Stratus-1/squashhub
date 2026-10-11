# Uitsig Club Champs 2026 — safe tournament fee and payment-claim workflow

Nothing is posted, marked paid or credited by this plan until you approve the final "Post charges" step separately.

## What exists today (checked)

- Uitsig: 77 registrations, all `fee_status = due`, none linked to a fee row, no proofs uploaded, nothing paid. That matches the R7,700 shown.
- Contact overlap: 76 have an email but only 73 distinct emails, so some families share one email. Entrants must be identified by member ID only.
- Tournament fees already have a ledger home: `club_member_fee_payments` with `fee_type = 'tournament_entry'` (127 rows across clubs, linked from `club_champs_registrations.fee_payment_id`). This is the existing per-member charge, so no new ledger is needed.
- Registrations already hold `proof_url` / `proof_uploaded_*`, and the admin Registrations dialog can already open a proof. `member_credit_transactions` already supports a pending → confirmed flow with proof.
- There is no saved "fee per person vs per category" setting. Today one registration (one person) carries one fee.
- Pay-before-entry = No is now honoured. Entries stay confirmed and draw-eligible no matter what is paid.

## Status model (shown separately, never merged)

```text
Entry:    Confirmed entrant (independent of payment)
Fee:      Not charged -> Charged to account -> Payment reported -> Verified paid | Rejected/needs proof
```
"Outstanding" = charged minus verified. A reported payment never reduces the balance until an admin verifies it.

## Phase 1 — Admin "Charge entry fee to member accounts" (preview only)

- New preview on the running tournament (admin only), one row per person: member #, name, categories, fee basis, amount, account record found Y/N, existing tournament charge, existing paid record, shared-email flag, and the planned action (Create / Skip-existing / Blocked).
- Fee basis selector: Per person (default, matching today's behaviour) or Per category entry. The choice is saved on the tournament, and the preview shows both totals (Uitsig: 77 × R100 = R7,700 vs 82 × R100 = R8,200).
- Blocks the action for missing member records, duplicates, or a registration already linked to a fee.
- The "Post charges" button stays disabled until you approve. When it runs, it is one server function, all or nothing, with an idempotency key `champ:{tournament}:{member}:{category|person}` and a unique index, so running it again never double-charges. Each fee row links back to its registration and is audit-logged.

## Phase 2 — Member "I have already paid"

- On the tournament entry/payment card and in My Account: a "Confirm payment made" form with method (EFT/bank transfer or card), optional date, reference, amount, and proof upload (private storage).
- Creates a payment claim with status "Payment reported — awaiting admin verification". No ledger credit, and the fee is not marked paid.
- Shared logins: the member picker lists only linked members (family/delegation rules that already exist). The member picks which person's charge the claim is for, or several people, with an amount for each. The server checks the caller may act for each chosen member ID.

## Phase 3 — Admin verification and reconciliation

- A "Payment claims" queue on the running tournament: view proof, Approve, Reject, or Request proof (with a reason).
- Approve goes through the existing fee-payment settlement path for the chosen member's tournament charge. The server checks the charge is unpaid and refuses any second posting.
- One payment covering several people: the admin splits the amount across individual member charges. The split must add up to the payment, and each split line is audited.
- An admin can also record an offline payment directly, for people who paid before the reconciliation list exists. It uses the same anti-duplicate check.
- The admin entries list shows every participant separately with Entry status | Fee | Reported | Verified | Outstanding.

## Technical details

- New table `champ_payment_claims` (club_id, champ_id, claimant user, status, method, paid_on, reference, amount_cents, proof_path, reviewed_by/at, reason) plus `champ_payment_claim_allocations` (claim_id, club_member_id, registration_id, fee_payment_id, amount_cents). RLS: club-scoped; members can read/insert only for member IDs they own or are delegated; admins of that club can review. Grants included.
- Security-definer functions: `champ_fee_charge_preview` (read-only), `champ_fee_post_charges` (idempotent), `champ_payment_claim_submit`, `champ_payment_claim_review` (approve/reject/allocate), with row locks and unique `(registration_id, basis_key)` on fee links.
- New tournament setting `entry_fee_basis` ('per_person' default). It only changes amounts for new postings and never rewrites existing rows.
- Tests: per-person vs per-category totals, re-running postings, shared-email family claims for the correct child only, split allocation totals, reject flow, and that pay-before-entry=No never affects draw eligibility.
- No changes to results, draws, notifications or other clubs' data. No publishing.

## Questions before building

1. Should Uitsig be charged per person (R7,700) or per category entry (R8,200)? Your note suggests per person.
2. When an admin verifies a payment, should it post as income straight away, or first go into the member's account credit and then settle the fee?
3. Should rejecting a claim notify the member, or stay silent until you turn messaging on?
4. Should the members who already paid externally be recorded by the admin from your list, or should we wait for them to report it themselves?

## Risks

- Posting charges creates live debts on 77 accounts. That is why the preview comes first and posting needs a separate approval.
- Shared family emails: any merge or charge by email would hit the wrong child. Everything is keyed by member ID.
- Paying late after a charge could double up with an older paid record. The preview flags these, and approval re-checks them.
