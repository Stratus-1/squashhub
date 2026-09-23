CREATE TABLE public.smart_tournament_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  owner_kind text NOT NULL DEFAULT 'federation',
  owner_id uuid,
  title text NOT NULL DEFAULT 'Untitled tournament',
  mode text NOT NULL DEFAULT 'describe',
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT std_owner_kind CHECK (owner_kind IN ('club','association','federation')),
  CONSTRAINT std_mode CHECK (mode IN ('guide','describe')),
  CONSTRAINT std_status CHECK (status IN ('draft','created','archived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_tournament_drafts TO authenticated;
GRANT ALL ON public.smart_tournament_drafts TO service_role;
ALTER TABLE public.smart_tournament_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage smart drafts" ON public.smart_tournament_drafts
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.smart_drafts_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER smart_drafts_touch BEFORE UPDATE ON public.smart_tournament_drafts
  FOR EACH ROW EXECUTE FUNCTION public.smart_drafts_touch();