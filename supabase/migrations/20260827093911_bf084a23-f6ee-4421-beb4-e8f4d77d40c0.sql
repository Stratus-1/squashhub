CREATE TABLE public.club_bank_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  match_key text NOT NULL,
  direction text NOT NULL DEFAULT 'any' CHECK (direction IN ('in','out','any')),
  account public.gl_account,
  custom_account_id uuid REFERENCES public.club_gl_accounts(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  discard boolean NOT NULL DEFAULT false,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_bank_rules TO authenticated;
GRANT ALL ON public.club_bank_rules TO service_role;

ALTER TABLE public.club_bank_rules ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX club_bank_rules_key_uniq ON public.club_bank_rules (club_id, match_key, direction);

CREATE POLICY "Club admins manage bank rules"
ON public.club_bank_rules FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Super admins manage bank rules"
ON public.club_bank_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_club_bank_rules_updated_at
BEFORE UPDATE ON public.club_bank_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();