CREATE OR REPLACE FUNCTION public.unaccent_safe(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT translate(COALESCE(_t, ''), 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ', 'aaaaaaeeeeiiiiooooouuuuyyncAAAAAAEEEEIIIIOOOOOUUUUYNC') $$;

DROP FUNCTION IF EXISTS public.check_member_duplicate_hint(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.check_member_duplicate_hint(
  _club_id uuid,
  _name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS TABLE(masked_name text, masked_email text, match_kind text, is_claimed boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH parts AS (
    SELECT btrim(lower(regexp_replace(regexp_replace(public.unaccent_safe(COALESCE(_name, '')), '[^a-zA-Z ]', ' ', 'g'), '\s+', ' ', 'g'))) AS n
  ),
  p AS (
    SELECT n,
           split_part(n, ' ', 1) AS first_tok,
           CASE WHEN n = '' THEN '' ELSE regexp_replace(n, '^.*\s', '') END AS last_tok
    FROM parts
  ),
  candidates AS (
    SELECT m.id, m.name, m.email, m.phone, m.user_id,
      btrim(lower(regexp_replace(regexp_replace(public.unaccent_safe(COALESCE(m.name, '')), '[^a-zA-Z ]', ' ', 'g'), '\s+', ' ', 'g'))) AS mn
    FROM public.club_members m
    WHERE m.club_id = _club_id
  ),
  matched AS (
    SELECT c.name, c.email, c.user_id,
      CASE
        WHEN _email IS NOT NULL AND _email <> ''
             AND lower(COALESCE(c.email, '')) = lower(_email) THEN 'email'
        WHEN _phone IS NOT NULL AND _phone <> ''
             AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') <> ''
             AND right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 9)
                 = right(regexp_replace(_phone, '\D', '', 'g'), 9) THEN 'phone'
        WHEN p.n <> '' AND c.mn = p.n THEN 'name'
        WHEN p.first_tok <> '' AND p.last_tok <> '' AND p.first_tok <> p.last_tok
             AND split_part(c.mn, ' ', 1) = p.first_tok
             AND regexp_replace(c.mn, '^.*\s', '') = p.last_tok THEN 'name'
        ELSE NULL
      END AS kind
    FROM candidates c CROSS JOIN p
  )
  SELECT
    split_part(name, ' ', 1) || ' ' ||
      COALESCE(NULLIF(left(split_part(name, ' ', 2), 1), ''), '') ||
      CASE WHEN split_part(name, ' ', 2) <> '' THEN '.' ELSE '' END AS masked_name,
    CASE
      WHEN COALESCE(email, '') = '' THEN NULL
      ELSE left(split_part(email, '@', 1), 2) || '***@' || split_part(email, '@', 2)
    END AS masked_email,
    kind AS match_kind,
    user_id IS NOT NULL AS is_claimed
  FROM matched
  WHERE kind IS NOT NULL
  ORDER BY CASE kind WHEN 'email' THEN 1 WHEN 'phone' THEN 2 ELSE 3 END
  LIMIT 5;
$function$;