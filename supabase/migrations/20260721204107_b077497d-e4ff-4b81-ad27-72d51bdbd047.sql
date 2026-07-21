DELETE FROM auth.users u
WHERE lower(coalesce(u.email, '')) = lower('hjj@hjhjhj.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = u.id
  );