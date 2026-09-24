CREATE TABLE public.ai_assist_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  member_id uuid,
  role text,
  kind text NOT NULL DEFAULT 'question', -- question | action | escalation | rollback
  request_text text,
  transcript_used boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  interpretation text,
  action_name text,
  action_args jsonb,
  preview jsonb,
  status text NOT NULL DEFAULT 'answered', -- answered | proposed | confirmed | executed | failed | cancelled | expired | escalated | rolled_back
  expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz,
  before_data jsonb,
  after_data jsonb,
  result jsonb,
  error text,
  escalation_reason text,
  ticket_id uuid,
  reversible boolean NOT NULL DEFAULT false,
  rollback_of uuid REFERENCES public.ai_assist_interactions(id),
  rolled_back_by uuid REFERENCES public.ai_assist_interactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_assist_interactions_created_idx ON public.ai_assist_interactions(created_at DESC);
CREATE INDEX ai_assist_interactions_club_idx ON public.ai_assist_interactions(club_id, created_at DESC);
CREATE INDEX ai_assist_interactions_user_idx ON public.ai_assist_interactions(user_id, created_at DESC);

GRANT SELECT ON public.ai_assist_interactions TO authenticated;
GRANT ALL ON public.ai_assist_interactions TO service_role;
ALTER TABLE public.ai_assist_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own AI activity" ON public.ai_assist_interactions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_ai_assist_interactions_updated_at BEFORE UPDATE ON public.ai_assist_interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_use_ai_actions(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_user_id)
    OR (_club_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.club_beta_features f WHERE f.club_id = _club_id AND f.feature = 'ai_actions')
        AND EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = _club_id AND m.user_id = _user_id));
$$;

ALTER TABLE public.club_beta_features DROP CONSTRAINT club_beta_features_feature_check;
ALTER TABLE public.club_beta_features ADD CONSTRAINT club_beta_features_feature_check CHECK (feature IN ('tournament_beta','ai_actions'));
INSERT INTO public.club_beta_features (club_id, feature) VALUES ('11111111-1111-1111-1111-111111111111', 'ai_actions') ON CONFLICT DO NOTHING;