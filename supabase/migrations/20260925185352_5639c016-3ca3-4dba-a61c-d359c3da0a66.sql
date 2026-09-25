CREATE TABLE public.tournament_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  name text NOT NULL,
  definition jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_templates TO authenticated;
GRANT ALL ON public.tournament_templates TO service_role;
ALTER TABLE public.tournament_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club tournament managers manage templates" ON public.tournament_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = tournament_templates.club_id AND m.user_id = auth.uid() AND m.role = 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = tournament_templates.club_id AND m.user_id = auth.uid() AND m.role = 'admin'));
CREATE INDEX tournament_templates_club_idx ON public.tournament_templates(club_id, template_key);
CREATE TRIGGER update_tournament_templates_updated_at BEFORE UPDATE ON public.tournament_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();