
-- ============ Batches ============
CREATE TABLE public.club_association_payable_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  national_body_fee_id UUID NOT NULL REFERENCES public.national_body_fees(id) ON DELETE RESTRICT,
  season_label TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2),
  payment_reference TEXT,
  bank_account TEXT,
  notes TEXT,
  journal_ref_raise UUID,
  journal_ref_settle UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_payable_batches TO authenticated;
GRANT ALL ON public.club_association_payable_batches TO service_role;

ALTER TABLE public.club_association_payable_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitted members manage payable batches"
ON public.club_association_payable_batches
FOR ALL
TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));

CREATE TRIGGER club_association_payable_batches_updated_at
BEFORE UPDATE ON public.club_association_payable_batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_capb_club ON public.club_association_payable_batches(club_id);
CREATE INDEX idx_capb_fee ON public.club_association_payable_batches(national_body_fee_id);

-- ============ Lines ============
CREATE TABLE public.club_association_payable_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.club_association_payable_batches(id) ON DELETE CASCADE,
  club_member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE RESTRICT,
  league_number TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_payable_lines TO authenticated;
GRANT ALL ON public.club_association_payable_lines TO service_role;

ALTER TABLE public.club_association_payable_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitted members manage payable lines"
ON public.club_association_payable_lines
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_association_payable_batches b
  WHERE b.id = club_association_payable_lines.batch_id
    AND public.is_club_admin_or_permitted(auth.uid(), b.club_id, 'fees')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_association_payable_batches b
  WHERE b.id = club_association_payable_lines.batch_id
    AND public.is_club_admin_or_permitted(auth.uid(), b.club_id, 'fees')
));

CREATE TRIGGER club_association_payable_lines_updated_at
BEFORE UPDATE ON public.club_association_payable_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_capl_batch ON public.club_association_payable_lines(batch_id);
CREATE INDEX idx_capl_member ON public.club_association_payable_lines(club_member_id);
