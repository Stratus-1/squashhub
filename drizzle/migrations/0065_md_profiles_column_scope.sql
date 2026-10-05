-- Match Day links may read only display names/avatars of profiles, never contact details.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, name, avatar_url) ON public.profiles TO anon;