CREATE OR REPLACE FUNCTION public.platform_club_adoption()
RETURNS TABLE (
  club_id uuid,
  club_name text,
  subdomain text,
  tenant_type text,
  created_at timestamptz,
  members bigint,
  signed_up bigint,
  admins bigint,
  first_signup timestamptz,
  last_signup timestamptz,
  signups_7d bigint,
  signups_30d bigint,
  first_member_id uuid,
  first_member_name text,
  first_member_email text,
  has_subscription boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH agg AS (
    SELECT
      c.id,
      c.name,
      c.subdomain,
      c.tenant_type,
      c.created_at,
      count(m.id) AS members,
      count(m.id) FILTER (WHERE m.user_id IS NOT NULL) AS signed_up,
      count(m.id) FILTER (WHERE m.role = 'admin'::public.club_member_role) AS admins,
      min(m.joined_at) FILTER (WHERE m.user_id IS NOT NULL) AS first_signup,
      max(m.joined_at) FILTER (WHERE m.user_id IS NOT NULL) AS last_signup,
      count(m.id) FILTER (WHERE m.user_id IS NOT NULL AND m.joined_at > now() - interval '7 days') AS signups_7d,
      count(m.id) FILTER (WHERE m.user_id IS NOT NULL AND m.joined_at > now() - interval '30 days') AS signups_30d
    FROM public.clubs c
    LEFT JOIN public.club_members m ON m.club_id = c.id
    GROUP BY c.id, c.name, c.subdomain, c.tenant_type, c.created_at
  )
  SELECT
    a.id,
    a.name,
    a.subdomain,
    a.tenant_type::text,
    a.created_at,
    a.members,
    a.signed_up,
    a.admins,
    a.first_signup,
    a.last_signup,
    a.signups_7d,
    a.signups_30d,
    fm.id,
    fm.name,
    fm.email,
    EXISTS (SELECT 1 FROM public.club_subscriptions s WHERE s.club_id = a.id) AS has_subscription
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT m.id, m.name, m.email
    FROM public.club_members m
    WHERE m.club_id = a.id AND m.user_id IS NOT NULL
    ORDER BY m.joined_at ASC NULLS LAST
    LIMIT 1
  ) fm ON true
  WHERE public.is_platform_admin(auth.uid())
  ORDER BY a.signed_up DESC, a.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.platform_club_adoption() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_grant_club_admin(p_club_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_club uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT club_id INTO v_club FROM public.club_members WHERE id = p_club_member_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  UPDATE public.club_members
     SET role = 'admin'::public.club_member_role
   WHERE id = p_club_member_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_grant_club_admin(uuid) TO authenticated;