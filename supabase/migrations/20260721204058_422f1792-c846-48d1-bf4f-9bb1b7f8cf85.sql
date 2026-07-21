DELETE FROM public.profiles p
WHERE lower(coalesce(p.email, '')) = lower('hjj@hjhjhj.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = p.id
  );