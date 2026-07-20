CREATE OR REPLACE FUNCTION public.count_member_duplicate_hints(
  _club_id uuid,
  _name text,
  _phone text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.club_members m
  WHERE m.club_id = _club_id
    AND (
      (
        COALESCE(_phone, '') <> ''
        AND LENGTH(regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g')) >= 9
        AND RIGHT(regexp_replace(m.phone, '\D', '', 'g'), 9)
            = RIGHT(regexp_replace(_phone, '\D', '', 'g'), 9)
      )
      OR (
        COALESCE(_name, '') <> ''
        AND LOWER(TRIM(COALESCE(m.name, ''))) = LOWER(TRIM(_name))
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_member_duplicate_hints(uuid, text, text) TO anon, authenticated;