CREATE TABLE IF NOT EXISTS public.club_fees_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  payee_type TEXT NOT NULL CHECK (payee_type IN ('league_association','national_body')),
  payee_name TEXT NOT NULL,
  payee_ref_id UUID,
  basis TEXT NOT NULL DEFAULT 'per_member' CHECK (basis IN ('per_member','per_club')),
  amount NUMERIC NOT NULL DEFAULT 0,
  due_month INT NOT NULL DEFAULT 1 CHECK (due_month BETWEEN 1 AND 12),
  due_day INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_fees_payable_club ON public.club_fees_payable(club_id);

ALTER TABLE public.club_fees_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their club's payable fees"
ON public.club_fees_payable FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_fees_payable.club_id
      AND cm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Club admins can insert payable fees"
ON public.club_fees_payable FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_fees_payable.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Club admins can update payable fees"
ON public.club_fees_payable FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_fees_payable.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Club admins can delete payable fees"
ON public.club_fees_payable FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_fees_payable.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER trg_club_fees_payable_updated_at
BEFORE UPDATE ON public.club_fees_payable
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();