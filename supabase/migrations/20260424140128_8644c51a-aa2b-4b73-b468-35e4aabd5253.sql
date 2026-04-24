-- Cleanup test user: Vian Crafford on NSC
-- Preserve member record but clear identity fields so he can re-register fresh
UPDATE public.club_members
SET user_id = NULL,
    email = NULL,
    phone = NULL,
    club_member_number = NULL,
    updated_at = now()
WHERE id = '0ad3e3d1-e342-4c54-8289-95488402d2ca';

-- Delete profile and auth user so signup can recreate them
DELETE FROM public.profiles WHERE id = 'f95a51f0-abe4-402e-9c4c-7295be12619a';
DELETE FROM auth.users WHERE id = 'f95a51f0-abe4-402e-9c4c-7295be12619a';