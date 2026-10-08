CREATE TABLE public.user_menu_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  menu_key text NOT NULL,
  item_order jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id, menu_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_menu_preferences TO authenticated;
GRANT ALL ON public.user_menu_preferences TO service_role;
ALTER TABLE public.user_menu_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own menu prefs select" ON public.user_menu_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own menu prefs insert" ON public.user_menu_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own menu prefs update" ON public.user_menu_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own menu prefs delete" ON public.user_menu_preferences FOR DELETE TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.user_menu_preferences IS 'Display-only menu order per user/club. Never used for authorisation.';