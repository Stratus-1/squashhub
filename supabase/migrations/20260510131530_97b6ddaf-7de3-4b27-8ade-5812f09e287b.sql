
-- Audit log for member_league_registrations changes
CREATE TABLE public.member_league_registrations_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  registration_id UUID,
  club_member_id UUID,
  league_id UUID,
  club_id UUID,
  old_player_rank INT,
  new_player_rank INT,
  old_is_captain BOOLEAN,
  new_is_captain BOOLEAN,
  old_is_reserve BOOLEAN,
  new_is_reserve BOOLEAN,
  old_league_association_number TEXT,
  new_league_association_number TEXT,
  actor_user_id UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mlra_club ON public.member_league_registrations_audit(club_id, changed_at DESC);
CREATE INDEX idx_mlra_member ON public.member_league_registrations_audit(club_member_id, changed_at DESC);
CREATE INDEX idx_mlra_league ON public.member_league_registrations_audit(league_id, changed_at DESC);

ALTER TABLE public.member_league_registrations_audit ENABLE ROW LEVEL SECURITY;

-- Only club admins can view audit rows for their own club
CREATE POLICY "Club admins can view their club audit"
  ON public.member_league_registrations_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = member_league_registrations_audit.club_id
        AND cm.role = 'admin'
    )
  );

-- No direct writes — only the trigger (SECURITY DEFINER) inserts rows
CREATE POLICY "No direct inserts" ON public.member_league_registrations_audit FOR INSERT WITH CHECK (false);
CREATE POLICY "No updates" ON public.member_league_registrations_audit FOR UPDATE USING (false);
CREATE POLICY "No deletes" ON public.member_league_registrations_audit FOR DELETE USING (false);

-- Trigger function: write audit row on every change
CREATE OR REPLACE FUNCTION public.log_member_league_registration_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_member_id UUID;
BEGIN
  v_member_id := COALESCE(NEW.club_member_id, OLD.club_member_id);
  SELECT club_id INTO v_club_id FROM public.club_members WHERE id = v_member_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.member_league_registrations_audit (
      action, registration_id, club_member_id, league_id, club_id,
      new_player_rank, new_is_captain, new_is_reserve, new_league_association_number,
      actor_user_id
    ) VALUES (
      'INSERT', NEW.id, NEW.club_member_id, NEW.league_id, v_club_id,
      NEW.player_rank, NEW.is_captain, NEW.is_reserve, NEW.league_association_number,
      auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.member_league_registrations_audit (
      action, registration_id, club_member_id, league_id, club_id,
      old_player_rank, new_player_rank,
      old_is_captain, new_is_captain,
      old_is_reserve, new_is_reserve,
      old_league_association_number, new_league_association_number,
      actor_user_id
    ) VALUES (
      'UPDATE', NEW.id, NEW.club_member_id, NEW.league_id, v_club_id,
      OLD.player_rank, NEW.player_rank,
      OLD.is_captain, NEW.is_captain,
      OLD.is_reserve, NEW.is_reserve,
      OLD.league_association_number, NEW.league_association_number,
      auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.member_league_registrations_audit (
      action, registration_id, club_member_id, league_id, club_id,
      old_player_rank, old_is_captain, old_is_reserve, old_league_association_number,
      actor_user_id
    ) VALUES (
      'DELETE', OLD.id, OLD.club_member_id, OLD.league_id, v_club_id,
      OLD.player_rank, OLD.is_captain, OLD.is_reserve, OLD.league_association_number,
      auth.uid()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mlr_change ON public.member_league_registrations;
CREATE TRIGGER trg_log_mlr_change
AFTER INSERT OR UPDATE OR DELETE ON public.member_league_registrations
FOR EACH ROW EXECUTE FUNCTION public.log_member_league_registration_change();
