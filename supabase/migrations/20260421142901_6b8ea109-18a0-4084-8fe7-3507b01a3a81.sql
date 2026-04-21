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
  raw_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  norm_phone text;
BEGIN
  -- Normalize phone to "national" form (drop leading 0 OR leading country code 27)
  -- so 0823555822, 27823555822 and +27823555822 all collapse to 823555822.
  IF raw_phone = '' THEN
    norm_phone := '';
  ELSIF length(raw_phone) >= 11 AND left(raw_phone, 2) = '27' THEN
    norm_phone := substring(raw_phone from 3);
  ELSIF length(raw_phone) >= 10 AND left(raw_phone, 1) = '0' THEN
    norm_phone := substring(raw_phone from 2);
  ELSE
    norm_phone := raw_phone;
  END IF;

  IF _club_id IS NULL OR norm_email = '' THEN
    RETURN;
  END IF;
  IF norm_number = '' AND norm_phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      cm.id,
      cm.name,
      cm.club_member_number,
      regexp_replace(coalesce(cm.phone, ''), '\D', '', 'g') AS db_digits
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND cm.user_id IS NULL
      AND lower(coalesce(cm.email, '')) = norm_email
  ),
  normalized AS (
    SELECT
      c.id,
      c.name,
      c.club_member_number,
      CASE
        WHEN c.db_digits = '' THEN ''
        WHEN length(c.db_digits) >= 11 AND left(c.db_digits, 2) = '27' THEN substring(c.db_digits from 3)
        WHEN length(c.db_digits) >= 10 AND left(c.db_digits, 1) = '0' THEN substring(c.db_digits from 2)
        ELSE c.db_digits
      END AS db_phone_norm
    FROM candidates c
  )
  SELECT
    n.id,
    CASE
      WHEN n.name IS NULL OR btrim(n.name) = '' THEN 'Member'
      WHEN position(' ' in btrim(n.name)) = 0 THEN btrim(n.name)
      ELSE split_part(btrim(n.name), ' ', 1)
           || ' '
           || left(split_part(btrim(n.name), ' ',
                array_length(string_to_array(btrim(n.name), ' '), 1)), 1)
           || '.'
    END AS masked_name,
    (norm_number <> '' AND upper(coalesce(n.club_member_number, '')) = norm_number) AS has_number,
    (norm_phone <> '' AND n.db_phone_norm = norm_phone) AS has_phone
  FROM normalized n
  WHERE
    (norm_number <> '' AND upper(coalesce(n.club_member_number, '')) = norm_number)
    OR
    (norm_phone <> '' AND n.db_phone_norm = norm_phone)
  LIMIT 10;
END;
$$;