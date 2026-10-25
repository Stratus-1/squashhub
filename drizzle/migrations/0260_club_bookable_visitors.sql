CREATE OR REPLACE FUNCTION public.club_bookable_visitors(p_club_id uuid)
RETURNS TABLE (member_id uuid, name text, home_club_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only club members (and admins) may see who holds a live visitor pass.
  -- A visitor features in booking pickers ONLY while they hold an active,
  -- paid (or club-approved free) day / 3-day / month pass inside its window.
  SELECT cm.id, cm.name, cm.home_club_name
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND cm.role::text = 'visitor'
    AND public.has_active_visitor_pass(cm.id)
    AND (
      EXISTS (
        SELECT 1 FROM public.club_members me
        WHERE me.club_id = p_club_id AND me.user_id = auth.uid()
      )
      OR public.is_club_admin(auth.uid(), p_club_id)
      OR public.is_platform_admin(auth.uid())
    )
  ORDER BY cm.name;
$$;

GRANT EXECUTE ON FUNCTION public.club_bookable_visitors(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_bookable_visitors(uuid) TO service_role;