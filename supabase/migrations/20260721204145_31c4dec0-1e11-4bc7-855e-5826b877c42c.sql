WITH deleted_members AS (
  DELETE FROM public.club_members cm
  WHERE cm.club_id = '11111111-1111-1111-1111-111111111111'
    AND lower(coalesce(cm.name, '')) IN (lower('Johan Liebenberg'), lower('Izak Lamprecht'))
    AND NOT EXISTS (
      SELECT 1 FROM public.member_association_affiliations maa WHERE maa.club_member_id = cm.id
    )
  RETURNING cm.user_id
), deleted_profiles AS (
  DELETE FROM public.profiles p
  USING deleted_members dm
  WHERE p.id = dm.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.club_members cm WHERE cm.user_id = p.id
    )
  RETURNING p.id
)
DELETE FROM auth.users u
USING deleted_profiles dp
WHERE u.id = dp.id
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.user_id = u.id
  );