-- Remove the incorrect Ladies 1st League registration only
DELETE FROM public.member_league_registrations
WHERE id = '6d11cedc-fb9e-4895-a9da-ddff1c8f8cfc';

-- Reset linkage on the CSIR member row (preserve plays_league, role, gender, NSA affil, Men's 7th registration)
UPDATE public.club_members
SET user_id = NULL,
    email = NULL,
    phone = NULL,
    club_member_number = NULL,
    updated_at = now()
WHERE id = '05c54f4c-36af-4f9b-a59c-e9f03a14ebae';

-- Wipe profile + auth user so email can be reused
DELETE FROM public.profiles WHERE id = '17a5609a-46e2-41d9-996a-e4c8d97379ec';
DELETE FROM auth.users WHERE id = '17a5609a-46e2-41d9-996a-e4c8d97379ec';