-- Cleanup Grant Williams for re-test per test-data-cleanup-rules.md
-- Wipe auth/contact/member#, preserve gender, role, plays_league, NSA affiliation.
-- Also delete the incorrect Ladies 1st League team registration.
-- Keep Men's 7th League team registration intact.

DELETE FROM public.member_league_registrations
WHERE id = '01a87085-7627-4743-acf9-7fc270cbb142';

DELETE FROM auth.users
WHERE id = 'bc24c153-f520-42eb-bded-27d915366280';

UPDATE public.club_members
SET user_id = NULL,
    email = NULL,
    phone = NULL,
    club_member_number = NULL
WHERE id = '05c54f4c-36af-4f9b-a59c-e9f03a14ebae';
