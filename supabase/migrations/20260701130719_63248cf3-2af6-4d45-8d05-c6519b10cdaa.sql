
-- 1) Relink Douglas Senekal's CSIR member row to his Google (gmail) auth account
UPDATE public.club_members
SET user_id = '878850a0-243f-4071-ad6c-1c60f57b5f77',
    email = 'douglassenekal@gmail.com',
    updated_at = now()
WHERE id = '2eca92ea-a9a8-4ac9-b299-c360d89689e8';

-- 2) Broaden existing-member signup lookup to also match by league_association_number
CREATE OR REPLACE FUNCTION public.lookup_existing_member_for_signup(
  _club_id uuid, _email text, _number text DEFAULT NULL::text, _phone text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, masked_name text, has_number boolean, has_phone boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_email text := lower(btrim(coalesce(_email, '')));
  norm_number text := upper(btrim(coalesce(_number, '')));
  raw_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  norm_phone text;
  num_digits text := regexp_replace(norm_number, '\D', '', 'g');
BEGIN
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
      regexp_replace(coalesce(cm.phone, ''), '\D', '', 'g') AS db_digits,
      (
        SELECT string_agg(upper(btrim(maa.league_association_number)), '|')
        FROM public.member_association_affiliations maa
        WHERE maa.club_member_id = cm.id AND maa.active = true
      ) AS league_nums
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND cm.user_id IS NULL
      AND lower(coalesce(cm.email, '')) = norm_email
  ),
  normalized AS (
    SELECT
      c.id, c.name, c.club_member_number, c.league_nums,
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
    (
      norm_number <> '' AND (
        upper(coalesce(n.club_member_number, '')) = norm_number
        OR (n.league_nums IS NOT NULL AND ('|'||n.league_nums||'|') LIKE '%|'||norm_number||'|%')
        OR (num_digits <> '' AND n.league_nums IS NOT NULL
            AND n.league_nums ~ ('(^|\|)[A-Z]*'||num_digits||'(\||$)'))
      )
    ) AS has_number,
    (norm_phone <> '' AND n.db_phone_norm = norm_phone) AS has_phone
  FROM normalized n
  WHERE
    (
      norm_number <> '' AND (
        upper(coalesce(n.club_member_number, '')) = norm_number
        OR (n.league_nums IS NOT NULL AND ('|'||n.league_nums||'|') LIKE '%|'||norm_number||'|%')
        OR (num_digits <> '' AND n.league_nums IS NOT NULL
            AND n.league_nums ~ ('(^|\|)[A-Z]*'||num_digits||'(\||$)'))
      )
    )
    OR
    (norm_phone <> '' AND n.db_phone_norm = norm_phone)
  LIMIT 10;
END;
$function$;
