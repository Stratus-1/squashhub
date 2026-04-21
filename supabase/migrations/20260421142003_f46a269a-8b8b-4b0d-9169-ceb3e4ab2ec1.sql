-- Reset Susan Crafford's NSC shell row so the "Register Existing Member" flow can be tested cleanly.
-- Unlinks the auth user, clears wizard-collected fields, keeps email + phone (the lookup keys).
UPDATE public.club_members
SET
  user_id = NULL,
  club_member_number = NULL,
  gender = NULL,
  skill_level = NULL,
  address = NULL,
  id_number = NULL,
  avatar_url = NULL,
  fee_category_id = NULL,
  plays_league = false,
  enable_league_association_id = NULL,
  updated_at = now()
WHERE id = '21612dc7-2dc2-4bf4-aa16-3dcfba8d3505';

-- Also clear any fee payments that might have been auto-created against her shell row
DELETE FROM public.club_member_fee_payments
WHERE club_member_id = '21612dc7-2dc2-4bf4-aa16-3dcfba8d3505'
  AND paid = false;