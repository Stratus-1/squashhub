
-- Fix NSA → association type, correct label & amount
UPDATE public.club_member_fee_payments
SET fee_type = 'association', fee_label = 'NSA', amount = 850
WHERE fee_type = 'league'
  AND fee_label = 'NSA Fee'
  AND club_member_id IN (SELECT id FROM public.club_members WHERE club_id = '55fe3e91-c444-45aa-86b8-c08af8e538f3');

-- Fix SSA → keep national type, correct abbreviation & amount
UPDATE public.club_member_fee_payments
SET fee_label = 'SSA', amount = 250
WHERE fee_type = 'national'
  AND fee_label = 'SSA Fee'
  AND club_member_id IN (SELECT id FROM public.club_members WHERE club_id = '55fe3e91-c444-45aa-86b8-c08af8e538f3');

-- Remove the placeholder Membership rows (no fee_category_id assigned yet → would still show R0)
DELETE FROM public.club_member_fee_payments
WHERE fee_type = 'membership'
  AND fee_label = 'Membership Fee'
  AND amount = 0
  AND club_member_id IN (SELECT id FROM public.club_members WHERE club_id = '55fe3e91-c444-45aa-86b8-c08af8e538f3');
