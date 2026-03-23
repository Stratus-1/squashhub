-- =============================================
-- HONESTY BAR: Item catalog + member tab entries
-- =============================================

CREATE TABLE public.bar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'drinks',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view bar items" ON public.bar_items
  FOR SELECT TO authenticated
  USING (is_club_member(auth.uid(), club_id));

CREATE POLICY "Club admins can manage bar items" ON public.bar_items
  FOR ALL TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Bar tab entries: each time a member logs an item
CREATE TABLE public.bar_tab_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total numeric NOT NULL,
  logged_by uuid REFERENCES public.club_members(id),
  settled boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_tab_entries ENABLE ROW LEVEL SECURITY;

-- Members can view own tab entries
CREATE POLICY "Members can view own bar tab" ON public.bar_tab_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = bar_tab_entries.club_member_id
        AND cm.user_id = auth.uid()
    )
  );

-- Club admins can view all tab entries
CREATE POLICY "Club admins can view all bar tabs" ON public.bar_tab_entries
  FOR SELECT TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Members can insert own tab entries (self-service)
CREATE POLICY "Members can log own bar items" ON public.bar_tab_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = bar_tab_entries.club_member_id
        AND cm.user_id = auth.uid()
        AND cm.club_id = bar_tab_entries.club_id
    )
  );

-- Club admins can insert tab entries (on behalf of members)
CREATE POLICY "Club admins can log bar items for members" ON public.bar_tab_entries
  FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Club admins can update tab entries (settle, correct)
CREATE POLICY "Club admins can update bar tabs" ON public.bar_tab_entries
  FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Club admins can delete tab entries
CREATE POLICY "Club admins can delete bar tabs" ON public.bar_tab_entries
  FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- =============================================
-- COURT ACCESS CONTROL: Config column on clubs
-- =============================================

-- Add access control type to club_secrets (keeps sensitive API keys separate)
ALTER TABLE public.club_secrets
ADD COLUMN IF NOT EXISTS access_control_type text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS access_control_api_key text,
ADD COLUMN IF NOT EXISTS access_control_api_url text;

COMMENT ON COLUMN public.club_secrets.access_control_type IS 'Court access method: none, key, tap_card, face_recognition, pin, other';
COMMENT ON COLUMN public.club_secrets.access_control_api_key IS 'API key for access control system integration';
COMMENT ON COLUMN public.club_secrets.access_control_api_url IS 'API endpoint for access control system';

-- Add honesty_bar_enabled flag to clubs
ALTER TABLE public.clubs
ADD COLUMN IF NOT EXISTS honesty_bar_enabled boolean NOT NULL DEFAULT false;