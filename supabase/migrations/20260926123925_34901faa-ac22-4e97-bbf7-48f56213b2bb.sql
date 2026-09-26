-- Account-recovery codes for the duplicate-registration safeguard.
CREATE TABLE public.account_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_tail text NOT NULL,
  code_hash text NOT NULL,
  requester_ip text,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_recovery_codes TO service_role;
ALTER TABLE public.account_recovery_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only the backend (service role) may read/write.
CREATE INDEX account_recovery_codes_tail_idx ON public.account_recovery_codes (phone_tail, created_at DESC);
CREATE INDEX account_recovery_codes_ip_idx ON public.account_recovery_codes (requester_ip, created_at DESC);

CREATE INDEX IF NOT EXISTS club_members_phone_tail_idx ON public.club_members (public.norm_phone_tail(phone));
CREATE INDEX IF NOT EXISTS people_phone_tail_idx ON public.people (public.norm_phone_tail(phone));

-- National candidate search across club members and the people spine.
-- Returns raw candidates to the backend only; classification happens in code.
CREATE OR REPLACE FUNCTION public.person_match_candidates(_phone_tail text, _first text, _last text)
RETURNS TABLE(source text, id uuid, club_id uuid, name text, phone text, email text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (
    SELECT NULLIF(_phone_tail, '') AS tail,
           NULLIF(btrim(lower(public.unaccent_safe(coalesce(_first, '')))), '') AS f,
           NULLIF(btrim(lower(public.unaccent_safe(coalesce(_last, '')))), '') AS l
  ),
  norm AS (
    SELECT 'club_member'::text AS source, m.id, m.club_id, m.name, m.phone, m.email, m.user_id,
      btrim(lower(regexp_replace(regexp_replace(public.unaccent_safe(coalesce(m.name, '')), '[^a-zA-Z ]', ' ', 'g'), '\s+', ' ', 'g'))) AS n
    FROM public.club_members m, q
    WHERE (q.tail IS NOT NULL AND public.norm_phone_tail(m.phone) = q.tail)
       OR (q.f IS NOT NULL AND q.l IS NOT NULL AND lower(m.name) LIKE q.f || '%' AND lower(m.name) LIKE '%' || q.l)
    UNION ALL
    SELECT 'person', p.id, NULL::uuid, coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name)), p.phone, p.email, p.auth_user_id,
      btrim(lower(regexp_replace(regexp_replace(public.unaccent_safe(coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name))), '[^a-zA-Z ]', ' ', 'g'), '\s+', ' ', 'g')))
    FROM public.people p, q
    WHERE p.merged_into_person_id IS NULL
      AND ((q.tail IS NOT NULL AND public.norm_phone_tail(p.phone) = q.tail)
        OR (q.f IS NOT NULL AND q.l IS NOT NULL AND lower(coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name))) LIKE q.f || '%'
            AND lower(coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name))) LIKE '%' || q.l))
  )
  SELECT source, id, club_id, name, phone, email, user_id FROM norm LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.person_match_candidates(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.person_match_candidates(text, text, text) TO service_role;