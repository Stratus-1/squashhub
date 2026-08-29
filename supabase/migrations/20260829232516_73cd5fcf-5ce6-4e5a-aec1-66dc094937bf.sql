CREATE OR REPLACE FUNCTION public.check_member_duplicate_hint(
  _club_id uuid,
  _name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS TABLE (masked_name text, match_kind text, is_claimed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    split_part(f.member_name, ' ', 1) || ' ' ||
      COALESCE(NULLIF(left(split_part(f.member_name, ' ', 2), 1), ''), '') ||
      CASE WHEN split_part(f.member_name, ' ', 2) <> '' THEN '.' ELSE '' END AS masked_name,
    f.match_kind,
    f.is_claimed
  FROM public.find_existing_club_member(_club_id, _name, _email, _phone, NULL, NULL) f;
$$;

REVOKE ALL ON FUNCTION public.check_member_duplicate_hint(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_member_duplicate_hint(uuid, text, text, text) TO anon, authenticated, service_role;