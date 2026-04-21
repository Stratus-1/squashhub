-- Delete auth accounts for Susan and Vian so they can re-register from scratch
DELETE FROM auth.users WHERE lower(email) IN ('sue.crafford@gmail.com', 'craffordv@gmail.com');

-- Reset Vian's shell row (Susan was reset in the previous migration)
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
WHERE id = '0ad3e3d1-e342-4c54-8289-95488402d2ca';

-- Clear unpaid fees for both
DELETE FROM public.club_member_fee_payments
WHERE club_member_id IN (
  '21612dc7-2dc2-4bf4-aa16-3dcfba8d3505',
  '0ad3e3d1-e342-4c54-8289-95488402d2ca'
)
AND paid = false;