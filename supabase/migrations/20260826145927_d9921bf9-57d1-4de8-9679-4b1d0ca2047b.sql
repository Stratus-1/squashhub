-- 1. Per-club assistant settings -------------------------------------------
CREATE TABLE public.club_ai_settings (
  club_id UUID PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admins')),
  voice_input_enabled BOOLEAN NOT NULL DEFAULT true,
  voice_output_enabled BOOLEAN NOT NULL DEFAULT true,
  text_chat_enabled BOOLEAN NOT NULL DEFAULT true,
  actions_enabled BOOLEAN NOT NULL DEFAULT true,
  default_voice TEXT,
  default_rate NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  response_style TEXT NOT NULL DEFAULT 'friendly' CHECK (response_style IN ('friendly','concise','coach')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_ai_settings TO authenticated;
GRANT ALL ON public.club_ai_settings TO service_role;
ALTER TABLE public.club_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their club AI settings"
  ON public.club_ai_settings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.club_members m
            WHERE m.club_id = club_ai_settings.club_id AND m.user_id = auth.uid())
    OR public.is_club_admin(auth.uid(), club_id)
  );

CREATE POLICY "Club admins manage AI settings"
  ON public.club_ai_settings FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER trg_club_ai_settings_updated_at
  BEFORE UPDATE ON public.club_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Personal voice / style preferences --------------------------------------
CREATE TABLE public.ai_user_preferences (
  user_id UUID PRIMARY KEY,
  voice TEXT,
  rate NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  response_style TEXT CHECK (response_style IN ('friendly','concise','coach')),
  speak_replies BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_user_preferences TO authenticated;
GRANT ALL ON public.ai_user_preferences TO service_role;
ALTER TABLE public.ai_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own AI preferences"
  ON public.ai_user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_ai_user_preferences_updated_at
  BEFORE UPDATE ON public.ai_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Conversations -----------------------------------------------------------
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  club_member_id UUID REFERENCES public.club_members(id) ON DELETE SET NULL,
  title TEXT,
  workflow_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own AI conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_ai_conversations_user ON public.ai_conversations(user_id, updated_at DESC);

CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Messages ----------------------------------------------------------------
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  action_key TEXT,
  action_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_key TEXT,
  workflow_step INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage messages in their own conversations"
  ON public.ai_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c
                 WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c
                      WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()));

CREATE INDEX idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at);

-- 5. Feedback / unanswered-question log --------------------------------------
CREATE TABLE public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT,
  rating TEXT CHECK (rating IN ('helpful','unhelpful')),
  unanswered BOOLEAN NOT NULL DEFAULT false,
  topic TEXT,
  route TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_feedback TO authenticated;
GRANT ALL ON public.ai_feedback TO service_role;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users log their own AI feedback"
  ON public.ai_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own AI feedback"
  ON public.ai_feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Club admins review AI feedback"
  ON public.ai_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));

CREATE INDEX idx_ai_feedback_club ON public.ai_feedback(club_id, created_at DESC);