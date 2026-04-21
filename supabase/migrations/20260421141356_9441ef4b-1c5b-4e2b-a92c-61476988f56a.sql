-- Safe lookup for the "Register Existing Member" flow.
-- Returns at most a handful of unclaimed shell rows that match
-- (email) AND (member#/league# OR phone) at the given club.
CREATE OR REPLACE FUNCTION public.lookup_existing_member_for_signup(
  _club_id uuid,
  _email text,
  _number text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  masked_name text,
  has_number boolean,
  has_phone boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_email text := lower(btrim(coalesce(_email, '')));
  norm_number text := upper(btrim(coalesce(_number, '')));
  -- keep digits only for phone comparison so '+27 82 ...' == '0827...'
  norm_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF _club_id IS NULL OR norm_email = '' THEN
    RETURN;
  END IF;
  IF norm_number = '' AND norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    -- Mask: first name + last-initial, e.g. "Susan C."
    CASE
      WHEN cm.name IS NULL OR btrim(cm.name) = '' THEN 'Member'
      WHEN position(' ' in btrim(cm.name)) = 0 THEN btrim(cm.name)
      ELSE split_part(btrim(cm.name), ' ', 1)
           || ' '
           || left(split_part(btrim(cm.name), ' ',
                array_length(string_to_array(btrim(cm.name), ' '), 1)), 1)
           || '.'
    END AS masked_name,
    (norm_number <> '' AND upper(coalesce(cm.club_member_number, '')) = norm_number) AS has_number,
    (norm_phone  <> '' AND regexp_replace(coalesce(cm.phone, ''), '\D', '', 'g') = norm_phone) AS has_phone
  FROM public.club_members cm
  WHERE cm.club_id = _club_id
    AND cm.user_id IS NULL
    AND lower(coalesce(cm.email, '')) = norm_email
    AND (
      (norm_number <> '' AND upper(coalesce(cm.club_member_number, '')) = norm_number)
      OR
      (norm_phone <> '' AND regexp_replace(coalesce(cm.phone, ''), '\D', '', 'g') = norm_phone)
    )
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_existing_member_for_signup(uuid, text, text, text) TO anon, authenticated;