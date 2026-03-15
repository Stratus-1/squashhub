
-- Recreate the delegates view as security definer (security_invoker=off)
-- so anon users can read delegate names even though club_members base table
-- blocks anonymous SELECT.
DROP VIEW IF EXISTS public.club_delegates_public;

CREATE VIEW public.club_delegates_public
WITH (security_invoker = off) AS
  SELECT cm.id, cm.club_id, COALESCE(p.name, cm.name, '') AS name
  FROM public.club_members cm
  LEFT JOIN public.profiles p ON p.id = cm.user_id
  WHERE EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = cm.club_id
      AND (c.chairman_member_id = cm.id OR c.secretary_member_id = cm.id OR c.club_captain_member_id = cm.id)
  );

-- Ensure anon and authenticated can SELECT from the view
GRANT SELECT ON public.club_delegates_public TO anon, authenticated;
