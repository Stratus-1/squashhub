-- Cleanup Grant Williams for re-test
-- Step 1: Clear linkage fields on club_members (preserve plays_league=true, role=admin, gender, NSA affiliation)
UPDATE public.club_members
SET user_id = NULL,
    email = NULL,
    phone = NULL,
    club_member_number = NULL,
    updated_at = now()
WHERE id = '05c54f4c-36af-4f9b-a59c-e9f03a14ebae';

-- Step 2: Delete the profiles row
DELETE FROM public.profiles WHERE id = 'cee645b6-3ea5-40b2-b284-98b2d7749bef';

-- Step 3: Delete the auth user so the email can be re-used
DELETE FROM auth.users WHERE id = 'cee645b6-3ea5-40b2-b284-98b2d7749bef';