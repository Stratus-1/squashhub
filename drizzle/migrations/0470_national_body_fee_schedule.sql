CREATE TABLE public.national_body_fee_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  basis text NOT NULL CHECK (basis IN ('per_court','per_member','per_club')),
  label text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_month integer CHECK (due_month BETWEEN 1 AND 12),
  due_day integer CHECK (due_day BETWEEN 1 AND 31),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, season_year, basis)
);

GRANT SELECT ON public.national_body_fee_schedule TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.national_body_fee_schedule TO authenticated;
GRANT ALL ON public.national_body_fee_schedule TO service_role;

ALTER TABLE public.national_body_fee_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view national body fees"
  ON public.national_body_fee_schedule FOR SELECT TO authenticated USING (true);

CREATE POLICY "Platform admins manage national body fees"
  ON public.national_body_fee_schedule FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.club_national_body_statement(_club_id uuid, _season_year integer)
RETURNS TABLE(organisation_id uuid, organisation_name text, fee_id uuid, label text, basis text, amount numeric,
              due_month integer, due_day integer, units integer, total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_courts integer := 0;
  v_members integer := 0;
BEGIN
  IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.is_club_finance_writer(auth.uid(), _club_id)
          OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT count(*) INTO v_courts FROM public.courts c
  WHERE c.club_id = _club_id AND coalesce(c.active, true) AND NOT coalesce(c.is_external, false);

  SELECT count(DISTINCT cm.id) INTO v_members
  FROM public.club_members cm
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
  WHERE cm.club_id = _club_id AND coalesce(cm.status::text, 'active') = 'active'
    AND maa.active AND nullif(trim(maa.league_association_number), '') IS NOT NULL;

  RETURN QUERY
  SELECT o.id, o.name, s.id, s.label, s.basis, s.amount, s.due_month, s.due_day,
    (CASE s.basis WHEN 'per_court' THEN v_courts WHEN 'per_member' THEN v_members ELSE 1 END)::integer,
    (CASE s.basis WHEN 'per_court' THEN v_courts WHEN 'per_member' THEN v_members ELSE 1 END) * s.amount
  FROM public.national_body_fee_schedule s
  JOIN public.organisations o ON o.id = s.organisation_id
  WHERE s.active AND s.season_year = _season_year
  ORDER BY o.name, s.basis;
END;
$$;

REVOKE ALL ON FUNCTION public.club_national_body_statement(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_national_body_statement(uuid, integer) TO authenticated, service_role;

INSERT INTO public.national_body_fee_schedule (organisation_id, season_year, basis, label, amount, due_month, due_day, notes)
VALUES
  ('429c693b-f042-4767-b22e-52b9ef732789', 2027, 'per_court', 'Court affiliation fee', 3350.40, 3, 31, 'SSA 2027 fee payable by clubs'),
  ('429c693b-f042-4767-b22e-52b9ef732789', 2027, 'per_member', 'Per member fee', 315.00, 3, 31, 'SSA 2027 fee payable by clubs');