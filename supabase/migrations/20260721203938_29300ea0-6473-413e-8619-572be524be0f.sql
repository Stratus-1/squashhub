DELETE FROM public.club_members
WHERE id = '174e7e8a-7ff8-403e-856e-2bf99be53264'
  AND club_id = '11111111-1111-1111-1111-111111111111'
  AND lower(name) = lower('Johan Liebenberg')
  AND lower(email) = lower('hjj@hjhjhj.com')
  AND role = 'visitor';

DELETE FROM public.profiles p
WHERE p.id = '465d4275-01a5-4252-817b-97b895cf5b85'
  AND lower(coalesce(p.email, '')) = lower('hjj@hjhjhj.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = p.id
  );