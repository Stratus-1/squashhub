
-- Drop the auth.users FK and add one to public.profiles instead
ALTER TABLE public.club_members DROP CONSTRAINT club_members_user_id_fkey;
ALTER TABLE public.club_members ADD CONSTRAINT club_members_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
