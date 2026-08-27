CREATE TABLE public.association_fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'receivable' CHECK (direction IN ('receivable','payable')),
  basis text NOT NULL DEFAULT 'member' CHECK (basis IN ('member','club','league_team')),
  label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  season_year integer,
  league_association_id uuid REFERENCES public.league_associations(id) ON DELETE SET NULL,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_association_fee_items_club ON public.association_fee_items(association_club_id, direction, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.association_fee_items TO authenticated;
GRANT ALL ON public.association_fee_items TO service_role;

ALTER TABLE public.association_fee_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Association members can view fee items"
ON public.association_fee_items FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), association_club_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Association admins manage fee items"
ON public.association_fee_items FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), association_club_id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_club_admin(auth.uid(), association_club_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER association_fee_items_touch
BEFORE UPDATE ON public.association_fee_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();