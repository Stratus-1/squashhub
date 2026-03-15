
-- Create a safe public view for club delegates (name only, no PII)
CREATE VIEW public.club_delegates_public
WITH (security_invoker = on) AS
  SELECT
    cm.id,
    cm.club_id,
    COALESCE(p.name, cm.name, '') AS name
  FROM public.club_members cm
  LEFT JOIN public.profiles p ON p.id = cm.user_id
  WHERE EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = cm.club_id
      AND (c.chairman_member_id = cm.id OR c.secretary_member_id = cm.id OR c.club_captain_member_id = cm.id)
  );

-- Grant anon access to the view
GRANT SELECT ON public.club_delegates_public TO anon;
GRANT SELECT ON public.club_delegates_public TO authenticated;

-- Drop the dangerous anon policy on the base table
DROP POLICY IF EXISTS "Public can view club delegates" ON public.club_members;
