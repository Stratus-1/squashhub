
DELETE FROM public.club_member_fee_payments WHERE club_member_id IN (SELECT id FROM public.club_members WHERE user_id = '0a2384f5-79c4-479c-8839-76b59c6c23e0');
DELETE FROM public.member_league_registrations WHERE club_member_id IN (SELECT id FROM public.club_members WHERE user_id = '0a2384f5-79c4-479c-8839-76b59c6c23e0');
DELETE FROM public.club_members WHERE user_id = '0a2384f5-79c4-479c-8839-76b59c6c23e0';
DELETE FROM public.profiles WHERE id = '0a2384f5-79c4-479c-8839-76b59c6c23e0';
DELETE FROM auth.users WHERE id = '0a2384f5-79c4-479c-8839-76b59c6c23e0';
