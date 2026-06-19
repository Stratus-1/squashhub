
-- 1. Add columns to existing tables
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS ranking_points numeric NOT NULL DEFAULT 0;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS ranking_points_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS points_base_win numeric NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS points_upset_bonus_per_rank numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS points_favourite_win_min numeric NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS points_loser_deduction numeric NOT NULL DEFAULT 0;

ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS affects_ranking_points boolean NOT NULL DEFAULT false;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS affects_ranking_points boolean NOT NULL DEFAULT false;

-- 2. Pending queue table
CREATE TABLE IF NOT EXISTS public.ranking_points_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  match_source_type text NOT NULL CHECK (match_source_type IN ('tournament','league','challenge','manual','match')),
  match_source_id uuid,
  winner_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  loser_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  winner_rank_at_match integer,
  loser_rank_at_match integer,
  winner_delta numeric NOT NULL,
  loser_delta numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpp_club_status ON public.ranking_points_pending(club_id, status);
CREATE INDEX IF NOT EXISTS idx_rpp_winner ON public.ranking_points_pending(winner_member_id);
CREATE INDEX IF NOT EXISTS idx_rpp_loser ON public.ranking_points_pending(loser_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ranking_points_pending TO authenticated;
GRANT ALL ON public.ranking_points_pending TO service_role;

ALTER TABLE public.ranking_points_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own club pending"
  ON public.ranking_points_pending FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.club_id = ranking_points_pending.club_id
    )
  );

CREATE POLICY "Club admins manage pending"
  ON public.ranking_points_pending FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = ranking_points_pending.club_id
        AND cm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = ranking_points_pending.club_id
        AND cm.role = 'admin'
    )
  );

CREATE POLICY "Authenticated insert pending for own club"
  ON public.ranking_points_pending FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.club_id = ranking_points_pending.club_id
    )
  );

-- 3. Ledger table
CREATE TABLE IF NOT EXISTS public.ranking_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  balance_after numeric NOT NULL,
  reason text NOT NULL,
  source_type text,
  source_id uuid,
  pending_id uuid REFERENCES public.ranking_points_pending(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpl_club_member ON public.ranking_points_ledger(club_id, member_id);
CREATE INDEX IF NOT EXISTS idx_rpl_created ON public.ranking_points_ledger(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ranking_points_ledger TO authenticated;
GRANT ALL ON public.ranking_points_ledger TO service_role;

ALTER TABLE public.ranking_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own club ledger"
  ON public.ranking_points_ledger FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.club_id = ranking_points_ledger.club_id
    )
  );

CREATE POLICY "Club admins manage ledger"
  ON public.ranking_points_ledger FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = ranking_points_ledger.club_id
        AND cm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = ranking_points_ledger.club_id
        AND cm.role = 'admin'
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_rpp_updated_at ON public.ranking_points_pending;
CREATE TRIGGER update_rpp_updated_at
  BEFORE UPDATE ON public.ranking_points_pending
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Approve function: applies pending delta atomically
CREATE OR REPLACE FUNCTION public.approve_ranking_points_pending(
  _pending_id uuid,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  is_admin boolean;
  new_winner_balance numeric;
  new_loser_balance numeric;
BEGIN
  SELECT * INTO p FROM public.ranking_points_pending WHERE id = _pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending row not found'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Already %', p.status; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p.club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.club_members
    SET ranking_points = ranking_points + p.winner_delta
    WHERE id = p.winner_member_id
    RETURNING ranking_points INTO new_winner_balance;

  UPDATE public.club_members
    SET ranking_points = ranking_points + p.loser_delta
    WHERE id = p.loser_member_id
    RETURNING ranking_points INTO new_loser_balance;

  INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, source_id, pending_id, created_by)
  VALUES
    (p.club_id, p.winner_member_id, p.winner_delta, new_winner_balance,
     'Win vs opponent (' || p.match_source_type || ')', p.match_source_type, p.match_source_id, p.id, auth.uid()),
    (p.club_id, p.loser_member_id, p.loser_delta, new_loser_balance,
     'Loss vs opponent (' || p.match_source_type || ')', p.match_source_type, p.match_source_id, p.id, auth.uid());

  UPDATE public.ranking_points_pending
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = COALESCE(_note, review_note)
    WHERE id = _pending_id;
END;
$$;

-- 5. Seed function: populate ranking_points from ladder positions
CREATE OR REPLACE FUNCTION public.seed_ranking_points_from_ladder(
  _club_id uuid,
  _top_score numeric DEFAULT 1000,
  _step numeric DEFAULT 10,
  _unranked_default numeric DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  rows_updated integer := 0;
  r RECORD;
  new_balance numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = _club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  FOR r IN
    SELECT id, ladder_position FROM public.club_members WHERE club_id = _club_id
  LOOP
    IF r.ladder_position IS NULL OR r.ladder_position < 1 THEN
      new_balance := _unranked_default;
    ELSE
      new_balance := GREATEST(0, _top_score - (r.ladder_position - 1) * _step);
    END IF;

    UPDATE public.club_members SET ranking_points = new_balance WHERE id = r.id;

    INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, created_by)
    VALUES (_club_id, r.id, new_balance, new_balance, 'Initial seed from ladder position', 'seed', auth.uid());

    rows_updated := rows_updated + 1;
  END LOOP;

  RETURN rows_updated;
END;
$$;
