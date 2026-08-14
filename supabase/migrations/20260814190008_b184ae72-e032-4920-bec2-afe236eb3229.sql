CREATE TABLE public.people_duplicate_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  person_b_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_a_id, person_b_id)
);

GRANT SELECT, INSERT, DELETE ON public.people_duplicate_dismissals TO authenticated;
GRANT ALL ON public.people_duplicate_dismissals TO service_role;

ALTER TABLE public.people_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage duplicate dismissals"
ON public.people_duplicate_dismissals
FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.dismiss_duplicate_pair(_a uuid, _b uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE lo uuid; hi uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  lo := LEAST(_a, _b); hi := GREATEST(_a, _b);
  INSERT INTO public.people_duplicate_dismissals (person_a_id, person_b_id, reason, created_by)
  VALUES (lo, hi, _reason, auth.uid())
  ON CONFLICT (person_a_id, person_b_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_duplicate_pair(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.people_duplicate_candidates(_limit integer DEFAULT 200)
 RETURNS TABLE(person_a_id uuid, person_a_name text, person_a_club text, person_b_id uuid, person_b_name text, person_b_club text, confidence numeric, reasons text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH real_links AS (
    SELECT cm.person_id, cm.club_id
    FROM public.club_members cm
    LEFT JOIN public.member_fee_categories fc ON fc.id = cm.fee_category_id
    WHERE cm.person_id IS NOT NULL
      AND cm.role <> 'visitor'::club_member_role
      AND COALESCE(fc.name,'') NOT ILIKE '%visitor%'
      AND cm.home_club_id IS NULL
      AND COALESCE(cm.home_club_name,'') = ''
  ),
  base AS (
    SELECT p.id,
           p.full_name,
           lower(regexp_replace(COALESCE(p.full_name,''), '[^a-zA-Z]', '', 'g')) AS norm_name,
           lower(btrim(COALESCE(p.email,''))) AS email,
           right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 9) AS phone9,
           lower(COALESCE(p.gender,'')) AS gender
    FROM public.people p
    WHERE p.merged_into_person_id IS NULL
      AND EXISTS (SELECT 1 FROM real_links rl WHERE rl.person_id = p.id)
  ),
  pairs AS (
    SELECT a.id AS a_id, a.full_name AS a_name, b.id AS b_id, b.full_name AS b_name,
           (a.norm_name <> '' AND a.norm_name = b.norm_name) AS same_name,
           (a.email <> '' AND a.email = b.email) AS same_email,
           (length(a.phone9) = 9 AND a.phone9 = b.phone9) AS same_phone,
           (a.gender <> '' AND a.gender = b.gender) AS same_gender
    FROM base a
    JOIN base b
      ON a.id < b.id
     AND (
          (a.norm_name <> '' AND a.norm_name = b.norm_name)
       OR (a.email <> '' AND a.email = b.email)
       OR (length(a.phone9) = 9 AND a.phone9 = b.phone9)
     )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.people_duplicate_dismissals d
      WHERE d.person_a_id = LEAST(a.id, b.id) AND d.person_b_id = GREATEST(a.id, b.id)
    )
  )
  SELECT
    p.a_id,
    p.a_name,
    (SELECT c.name FROM real_links rl JOIN public.clubs c ON c.id = rl.club_id WHERE rl.person_id = p.a_id LIMIT 1),
    p.b_id,
    p.b_name,
    (SELECT c.name FROM real_links rl JOIN public.clubs c ON c.id = rl.club_id WHERE rl.person_id = p.b_id LIMIT 1),
    LEAST(0.99,
      (CASE WHEN p.same_name THEN 0.55 ELSE 0 END)
    + (CASE WHEN p.same_email THEN 0.30 ELSE 0 END)
    + (CASE WHEN p.same_phone THEN 0.25 ELSE 0 END)
    + (CASE WHEN p.same_gender THEN 0.05 ELSE 0 END)
    )::numeric(4,2),
    (ARRAY[]::text[]
      || CASE WHEN p.same_name THEN ARRAY['same name'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_email THEN ARRAY['same email'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_phone THEN ARRAY['same phone'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_gender THEN ARRAY['same gender'] ELSE ARRAY[]::text[] END)
  FROM pairs p
  ORDER BY 7 DESC, 2
  LIMIT _limit;
$function$;