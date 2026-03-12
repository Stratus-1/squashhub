
-- Member fee categories table (e.g. Student, Pensioner, Normal, Spouse, Family)
CREATE TABLE public.member_fee_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  annual_fee numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_fee_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view fee categories" ON public.member_fee_categories FOR SELECT TO authenticated USING (is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can insert fee categories" ON public.member_fee_categories FOR INSERT TO authenticated WITH CHECK (is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can update fee categories" ON public.member_fee_categories FOR UPDATE TO authenticated USING (is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can delete fee categories" ON public.member_fee_categories FOR DELETE TO authenticated USING (is_club_admin(auth.uid(), club_id));

-- Add fee_category_id to club_members
ALTER TABLE public.club_members ADD COLUMN fee_category_id uuid REFERENCES public.member_fee_categories(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER set_member_fee_categories_updated_at BEFORE UPDATE ON public.member_fee_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
