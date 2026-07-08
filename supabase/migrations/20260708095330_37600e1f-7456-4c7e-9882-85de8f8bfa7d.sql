
-- Re-point the credit side of the chairman's "Member Fees" payments
-- from Membership Income → Debtors (Accounts Receivable), for the 4
-- remaining Gordons Bay members: Brad, Burt, Fernando, Yanu.
UPDATE club_journal_entries
SET account = 'debtors',
    description = 'Member payment (settles Accts Receivable)'
WHERE id IN (
  'ecb6fc0a-b594-4795-8ff6-b70449b0e507', -- Brad Botha
  '85912820-d29d-4fc2-880b-f3d8b701a70b', -- Burt Smit
  '3af6b15d-bd35-45e2-b3e7-8c6d9d04e015', -- Fernando Nieuwveldt
  '56968fc1-cbff-4213-ae6e-64a5f490cb3f'  -- Yanu Koorts
);

-- Also relabel the Dr Bank side so the pair reads consistently on statements.
UPDATE club_journal_entries
SET description = 'Member payment (settles Accts Receivable)'
WHERE id IN (
  '09dbe7d6-6b21-4506-bb9f-5e4c012acbea', -- Brad
  '01cac286-b316-4d3d-b2b6-389be9ab1d22', -- Burt
  '5963dc14-b09e-44ad-9ba2-2dde203025f4', -- Fernando
  '0bbd4a5d-1d89-4008-b1e9-2ab11227b03c'  -- Yanu
);

-- Mark the corresponding club_member_fee_payments as paid so the
-- member statements & outstanding-fee dashboards clear.
UPDATE club_member_fee_payments
SET paid = true, paid_at = COALESCE(paid_at, now())
WHERE id IN (
  'd3dffdef-925a-433a-adc1-6ec43dc1a6fc', -- Brad's Renewal Family Plan R1600
  '78133951-e578-457b-bb5c-da7ec806e8a7', -- Burt's Renewal Single R870
  'ea5e0f3c-435c-4bdd-b51a-30416b8c3a05', -- Fernando's Club Membership Single R870
  'ab7a3a03-8cd1-4bb8-a228-647c0d5500e8'  -- Yanu's Renewal Scholar R440
);
