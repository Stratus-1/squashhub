-- Clean up Vian Crafford for fresh "Register Existing Member" testing

-- 1. Delete fee payments for both memberships
DELETE FROM public.club_member_fee_payments
WHERE club_member_id IN (
  '0ad3e3d1-e342-4c54-8289-95488402d2ca', -- NSC
  '55a61960-ea90-4829-8b63-75a17d4d009e'  -- Lowveld Squash
);

-- 2. Delete the Lowveld Squash league-only membership entirely (removes LS affiliation/number LWL001)
DELETE FROM public.club_members
WHERE id = '55a61960-ea90-4829-8b63-75a17d4d009e';

-- 3. Reset NSC member record to unlinked / unconfigured
UPDATE public.club_members
SET user_id = NULL,
    club_member_number = NULL,
    fee_category_id = NULL,
    skill_level = NULL,
    enable_league_association_id = NULL,
    is_league_only_membership = false,
    plays_league = false
WHERE id = '0ad3e3d1-e342-4c54-8289-95488402d2ca';

-- 4. Delete the auth user so registration can start fresh
DELETE FROM auth.users WHERE id = 'ca602de1-edb3-4f8b-b71e-f785b6f1559a';
