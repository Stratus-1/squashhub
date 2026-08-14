ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS sanction_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sanctioning_org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sanction_reference text,
  ADD COLUMN IF NOT EXISTS sanction_notes text,
  ADD COLUMN IF NOT EXISTS sanctioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS sanctioned_by uuid,
  ADD COLUMN IF NOT EXISTS competition_level text NOT NULL DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS eligibility_min_age integer,
  ADD COLUMN IF NOT EXISTS eligibility_max_age integer,
  ADD COLUMN IF NOT EXISTS eligibility_requires_licence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eligibility_scope text NOT NULL DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS eligibility_notes text,
  ADD COLUMN IF NOT EXISTS federation_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS association_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_policy text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refund_cutoff_date date;

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_sanction_status_check
  CHECK (sanction_status = ANY (ARRAY['none','pending','approved','rejected']));

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_competition_level_check
  CHECK (competition_level = ANY (ARRAY['club','regional','provincial','national']));

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_eligibility_scope_check
  CHECK (eligibility_scope = ANY (ARRAY['club','association','open']));

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_refund_policy_check
  CHECK (refund_policy = ANY (ARRAY['none','full_before_cutoff','partial_before_cutoff']));

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_governance_fees_check
  CHECK (federation_fee_cents >= 0 AND association_fee_cents >= 0);

CREATE TABLE public.tournament_governance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.club_champs(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournament_governance_audit_champ ON public.tournament_governance_audit (champ_id, created_at DESC);

GRANT SELECT ON public.tournament_governance_audit TO authenticated;
GRANT ALL ON public.tournament_governance_audit TO service_role;

ALTER TABLE public.tournament_governance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins view their tournament governance history"
ON public.tournament_governance_audit
FOR SELECT
TO authenticated
USING (
  public.is_club_admin(auth.uid(), club_id)
  OR public.is_platform_admin(auth.uid())
  OR public.is_national_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.log_tournament_governance_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  oldv text;
  newv text;
  fields text[] := ARRAY[
    'sanction_status','sanctioning_org_id','sanction_reference','sanction_notes',
    'competition_level','eligibility_min_age','eligibility_max_age',
    'eligibility_requires_licence','eligibility_scope','eligibility_notes',
    'entry_fee_cents','federation_fee_cents','association_fee_cents',
    'refund_policy','refund_cutoff_date'
  ];
BEGIN
  FOREACH f IN ARRAY fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
      INTO oldv, newv USING OLD, NEW;
    IF oldv IS DISTINCT FROM newv THEN
      INSERT INTO public.tournament_governance_audit (champ_id, club_id, field, old_value, new_value, changed_by)
      VALUES (NEW.id, NEW.club_id, f, oldv, newv, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_tournament_governance
AFTER UPDATE ON public.club_champs
FOR EACH ROW EXECUTE FUNCTION public.log_tournament_governance_changes();