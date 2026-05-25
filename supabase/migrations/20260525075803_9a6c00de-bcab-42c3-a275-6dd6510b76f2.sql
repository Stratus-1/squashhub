ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS show_on_landing boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Authenticated users can view fee categories" ON public.member_fee_categories;

CREATE POLICY "Club members can view their club fee categories"
ON public.member_fee_categories
FOR SELECT
TO authenticated
USING (public.is_club_member(auth.uid(), club_id));

CREATE POLICY "Public can view fee categories flagged for landing"
ON public.member_fee_categories
FOR SELECT
TO anon, authenticated
USING (show_on_landing = true);