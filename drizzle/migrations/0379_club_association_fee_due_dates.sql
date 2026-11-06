CREATE TABLE public.club_association_fee_due_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  fee_item_id uuid NOT NULL,
  season_year integer NOT NULL,
  due_month smallint NOT NULL CHECK (due_month BETWEEN 1 AND 12),
  due_day smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, fee_item_id, season_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_fee_due_dates TO authenticated;
GRANT ALL ON public.club_association_fee_due_dates TO service_role;
ALTER TABLE public.club_association_fee_due_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins and finance read own payable dates" ON public.club_association_fee_due_dates
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id) OR public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Club admins and finance manage own payable dates" ON public.club_association_fee_due_dates
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_club_finance_writer(auth.uid(), club_id));