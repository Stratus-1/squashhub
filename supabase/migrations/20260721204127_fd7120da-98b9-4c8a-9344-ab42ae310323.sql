DELETE FROM auth.users u
WHERE u.id = '440639d9-df70-44d1-ab89-69a36b879b2e'
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = u.id
  );