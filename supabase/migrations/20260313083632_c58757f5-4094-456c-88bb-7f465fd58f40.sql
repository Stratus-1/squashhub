-- Fee tracking per club member (works even when user_id is null / pre-registered members)
CREATE TABLE IF NOT EXISTS public.club_member_fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL,
  fee_label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ NULL,
  season_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_member_id, fee_type, fee_label, season_year)
);

ALTER TABLE public.club_member_fee_payments ENABLE ROW LEVEL SECURITY;

-- Club admins/captains can manage fee records for members in their club
CREATE POLICY "Club admins can view club member fee payments"
ON public.club_member_fee_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND public.is_club_admin(auth.uid(), cm.club_id)
  )
);

CREATE POLICY "Club admins can insert club member fee payments"
ON public.club_member_fee_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND public.is_club_admin(auth.uid(), cm.club_id)
  )
);

CREATE POLICY "Club admins can update club member fee payments"
ON public.club_member_fee_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND public.is_club_admin(auth.uid(), cm.club_id)
  )
);

CREATE POLICY "Club admins can delete club member fee payments"
ON public.club_member_fee_payments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND public.is_club_admin(auth.uid(), cm.club_id)
  )
);

-- Keep updated_at current
DROP TRIGGER IF EXISTS trg_club_member_fee_payments_updated_at ON public.club_member_fee_payments;
CREATE TRIGGER trg_club_member_fee_payments_updated_at
BEFORE UPDATE ON public.club_member_fee_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from existing user-based fee_payments when possible
INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, created_at, updated_at)
SELECT
  cm.id,
  fp.fee_type,
  fp.fee_label,
  fp.amount,
  fp.paid,
  fp.paid_at,
  EXTRACT(YEAR FROM COALESCE(fp.created_at, now()))::INTEGER,
  fp.created_at,
  now()
FROM public.fee_payments fp
JOIN public.club_members cm ON cm.user_id = fp.user_id
ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;