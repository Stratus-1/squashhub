ALTER TABLE public.bar_items ADD COLUMN IF NOT EXISTS division TEXT NOT NULL DEFAULT 'bar';

CREATE TABLE public.club_bar_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  division TEXT NOT NULL DEFAULT 'bar',
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, value)
);

GRANT SELECT ON public.club_bar_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_bar_categories TO authenticated;
GRANT ALL ON public.club_bar_categories TO service_role;

ALTER TABLE public.club_bar_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view bar categories"
  ON public.club_bar_categories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_bar_categories.club_id
      AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Club admins can manage bar categories"
  ON public.club_bar_categories FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_bar_categories.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_bar_categories.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  ));

CREATE OR REPLACE FUNCTION public.update_club_bar_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_club_bar_categories_updated_at
  BEFORE UPDATE ON public.club_bar_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_club_bar_categories_updated_at();

CREATE INDEX idx_club_bar_categories_club ON public.club_bar_categories(club_id, division, sort_order);
CREATE INDEX idx_bar_items_division ON public.bar_items(club_id, division);