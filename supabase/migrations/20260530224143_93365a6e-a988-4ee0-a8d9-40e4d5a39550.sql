
-- Unlink club member but preserve the member record so Willem can re-register and re-link
UPDATE public.club_members SET user_id = NULL WHERE user_id = 'f6491013-d663-4d00-b9b0-198f63c695fa';

-- Remove profile row
DELETE FROM public.profiles WHERE id = 'f6491013-d663-4d00-b9b0-198f63c695fa';

-- Delete the auth user so the email can be re-registered from scratch
DELETE FROM auth.users WHERE id = 'f6491013-d663-4d00-b9b0-198f63c695fa';
