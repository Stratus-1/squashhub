
-- =========================================================
-- Gordons Bay: fix billing + payment allocation for 3 members
-- =========================================================

-- === JONATHAN HALLAND (GBSQ0012) ===
-- Correct fee: was R800 pro-rated, should be R1600 Family Plan (no pro-rate)
UPDATE public.club_member_fee_payments
SET amount = 1600,
    fee_label = 'Club Membership (Family Plan)',
    paid = true,
    paid_at = now()
WHERE id = '7addc725-8865-43ab-9dae-981fa1360031';

-- Fix fee-raised journal (R800 -> R1600) and update description
UPDATE public.club_journal_entries
SET debit = 1600,
    description = 'Fee raised: Club Membership (Family Plan)'
WHERE id = 'ef8acd0d-4afa-4be2-a94b-29415cbe4017';

UPDATE public.club_journal_entries
SET credit = 1600,
    description = 'Fee raised: Club Membership (Family Plan)'
WHERE id = '9b37b7d8-eb65-4d15-b458-f26404607fb2';

-- Reallocate his R1600 payment: Dr Bank / Cr Debtors (was Cr Membership Income)
UPDATE public.club_journal_entries
SET account = 'debtors',
    description = 'Member payment – Jonathan Halland (settles Accts Receivable)'
WHERE id = 'f6f3f7bc-2deb-4992-b139-261ad1d12867';

UPDATE public.club_journal_entries
SET description = 'Member payment – Jonathan Halland (settles Accts Receivable)'
WHERE id = 'e03cfa00-25b0-4a03-8a90-43d1d1230922';

-- === ETHAN JOUBERT (GBSQ0006) ===
-- Change category to Scholar (R440)
UPDATE public.club_members
SET fee_category_id = 'f57563d9-7f30-4281-92f1-ef601f5c16d0'
WHERE id = '7664ae2b-c72b-4f18-95c1-cb5bafd55502';

-- Correct fee amount R1600 -> R440, mark paid
UPDATE public.club_member_fee_payments
SET amount = 440,
    fee_label = 'Renewal Fees 2026 — Scholar',
    paid = true,
    paid_at = now()
WHERE id = '4c58dcf0-7692-4240-aa7a-f83280a7825f';

-- Fix fee-raised journal (R1600 -> R440)
UPDATE public.club_journal_entries
SET debit = 440,
    description = 'Fee raised: Renewal Fees 2026 — Scholar'
WHERE id = '3151caf4-578d-4816-9d91-d1087c296be0';

UPDATE public.club_journal_entries
SET credit = 440,
    description = 'Fee raised: Renewal Fees 2026 — Scholar'
WHERE id = '35d1c4a9-5389-4bc9-9fdb-4fc0a52d096b';

-- Reallocate his R440 payment: Dr Bank / Cr Debtors
UPDATE public.club_journal_entries
SET account = 'debtors',
    description = 'Member payment – Ethan Joubert (settles Accts Receivable)'
WHERE id = 'aacfca3c-771c-4e65-b19d-e7a6e52c0df6';

UPDATE public.club_journal_entries
SET description = 'Member payment – Ethan Joubert (settles Accts Receivable)'
WHERE id = '2a6602fc-75fe-46bc-9e23-dba32740beaf';

-- === VADEN WATSON (GBSQ0004) ===
-- Remove the wrong original entry AND its reversal (net zero anyway),
-- then re-post his R490 correctly, and mark fee paid.
DELETE FROM public.club_journal_entries
WHERE journal_ref IN (
  'd304ab9f-bb4e-48d3-ab85-355f33b7c50e',  -- original wrong entry
  '4e0b2cf0-ba26-4ede-acd0-bcfcba3115f2'   -- its reversal
);

-- Re-post payment correctly: Dr Bank / Cr Debtors R490
WITH new_ref AS (SELECT gen_random_uuid() AS jref)
INSERT INTO public.club_journal_entries
  (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at)
SELECT
  (SELECT club_id FROM public.club_members WHERE id = '6e84272d-eadc-4e71-89ab-7d5821d2b96f'),
  n.jref, a.account, a.debit, a.credit,
  'Member payment – Vaden Watson (settles Accts Receivable)',
  '6e84272d-eadc-4e71-89ab-7d5821d2b96f',
  '2026-06-30 00:00:00+00'
FROM new_ref n,
     (VALUES
       ('bank_current'::gl_account, 490::numeric, 0::numeric),
       ('debtors'::gl_account,      0::numeric,   490::numeric)
     ) AS a(account, debit, credit);

-- Mark Vaden's fee paid
UPDATE public.club_member_fee_payments
SET paid = true, paid_at = now()
WHERE id = '0ea5da15-72ab-4547-a022-ce8a4fa0296c';
