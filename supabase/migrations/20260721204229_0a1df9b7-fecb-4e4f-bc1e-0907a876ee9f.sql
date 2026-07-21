SELECT 'profiles' AS source, count(*) AS count
FROM public.profiles
WHERE lower(coalesce(email,'')) IN ('hjj@hjhjhj.com','aempcast@gmail.com')
UNION ALL
SELECT 'club_members' AS source, count(*) AS count
FROM public.club_members
WHERE lower(coalesce(email,'')) IN ('hjj@hjhjhj.com','aempcast@gmail.com')
UNION ALL
SELECT 'club_visitors' AS source, count(*) AS count
FROM public.club_visitors
WHERE lower(coalesce(email,'')) IN ('hjj@hjhjhj.com','aempcast@gmail.com');