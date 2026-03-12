
-- ==========================================
-- MULTI-TENANT SCHEMA FOR SQUASH CLUB APP
-- ==========================================

-- 1. CLUBS (tenants)
CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  address text,
  email text,
  phone text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_reference text,
  member_fee_annual numeric(10,2) DEFAULT 0,
  member_fee_due_month integer DEFAULT 1,
  fee_reminder_days_before integer DEFAULT 14,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

-- 2. CLUB MEMBERS (join table between users and clubs)
CREATE TYPE public.club_member_role AS ENUM ('captain', 'admin', 'member');

CREATE TABLE public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.club_member_role NOT NULL DEFAULT 'member',
  club_member_number text,
  plays_league boolean NOT NULL DEFAULT false,
  league_player_rank integer,
  id_number text,
  address text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_id, user_id)
);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

-- 3. LEAGUE ASSOCIATIONS (e.g. NSF - Northerns Squash Federation)
CREATE TABLE public.league_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  abbreviation text,
  contact_email text,
  contact_phone text,
  website text,
  fee_annual numeric(10,2) DEFAULT 0,
  fee_due_month integer DEFAULT 1,
  fee_payable_to text,
  fee_payment_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_associations ENABLE ROW LEVEL SECURITY;

-- 4. SSA (Squash South Africa) fees config per club
CREATE TABLE public.national_body_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  body_name text NOT NULL DEFAULT 'Squash South Africa',
  abbreviation text DEFAULT 'SSA',
  fee_annual numeric(10,2) DEFAULT 0,
  fee_due_month integer DEFAULT 1,
  fee_payable_to text,
  fee_payment_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.national_body_fees ENABLE ROW LEVEL SECURITY;

-- 5. LEAGUES (e.g. "7th League - CSI006")
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  association_id uuid REFERENCES public.league_associations(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

-- 6. MEMBER LEAGUE REGISTRATIONS
CREATE TABLE public.member_league_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_association_number text,
  ssa_number text,
  player_rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_member_id, league_id)
);

ALTER TABLE public.member_league_registrations ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Check if user is captain/admin of a club
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id AND club_id = _club_id AND role IN ('captain', 'admin')
  )
$$;

-- Check if user is member of a club
CREATE OR REPLACE FUNCTION public.is_club_member(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id AND club_id = _club_id
  )
$$;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- CLUBS
CREATE POLICY "Anyone authenticated can view clubs" ON public.clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Club creator can insert" ON public.clubs FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Club admins can update" ON public.clubs FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), id));

-- CLUB MEMBERS
CREATE POLICY "Club members can view fellow members" ON public.club_members FOR SELECT TO authenticated USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can insert members" ON public.club_members FOR INSERT TO authenticated WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR auth.uid() = user_id);
CREATE POLICY "Club admins can update members" ON public.club_members FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), club_id) OR auth.uid() = user_id);
CREATE POLICY "Club admins can delete members" ON public.club_members FOR DELETE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- LEAGUE ASSOCIATIONS
CREATE POLICY "Club members can view associations" ON public.league_associations FOR SELECT TO authenticated USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can manage associations" ON public.league_associations FOR INSERT TO authenticated WITH CHECK (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can update associations" ON public.league_associations FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can delete associations" ON public.league_associations FOR DELETE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- NATIONAL BODY FEES
CREATE POLICY "Club members can view national fees" ON public.national_body_fees FOR SELECT TO authenticated USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can manage national fees" ON public.national_body_fees FOR INSERT TO authenticated WITH CHECK (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can update national fees" ON public.national_body_fees FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can delete national fees" ON public.national_body_fees FOR DELETE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- LEAGUES
CREATE POLICY "Club members can view leagues" ON public.leagues FOR SELECT TO authenticated USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can manage leagues" ON public.leagues FOR INSERT TO authenticated WITH CHECK (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can update leagues" ON public.leagues FOR UPDATE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can delete leagues" ON public.leagues FOR DELETE TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- MEMBER LEAGUE REGISTRATIONS
CREATE POLICY "Members can view own registrations" ON public.member_league_registrations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_id AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));
CREATE POLICY "Admins or self can insert registrations" ON public.member_league_registrations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_id AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));
CREATE POLICY "Admins or self can update registrations" ON public.member_league_registrations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_id AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));
CREATE POLICY "Admins can delete registrations" ON public.member_league_registrations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_id AND public.is_club_admin(auth.uid(), cm.club_id)
  ));

-- Trigger for updated_at
CREATE TRIGGER clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER club_members_updated_at BEFORE UPDATE ON public.club_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER league_associations_updated_at BEFORE UPDATE ON public.league_associations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER national_body_fees_updated_at BEFORE UPDATE ON public.national_body_fees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER leagues_updated_at BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER member_league_registrations_updated_at BEFORE UPDATE ON public.member_league_registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
