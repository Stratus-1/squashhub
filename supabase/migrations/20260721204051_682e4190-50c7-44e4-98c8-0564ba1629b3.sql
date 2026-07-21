WITH deleted_members AS (
  DELETE FROM public.club_members cm
  WHERE cm.club_id = '11111111-1111-1111-1111-111111111111'
    AND lower(coalesce(cm.name, '')) = lower('Johan Liebenberg')
    AND lower(coalesce(cm.email, '')) = lower('hjj@hjhjhj.com')
  RETURNING cm.user_id
)
DELETE FROM public.profiles p
USING deleted_members dm
WHERE p.id = dm.user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = p.id
  );