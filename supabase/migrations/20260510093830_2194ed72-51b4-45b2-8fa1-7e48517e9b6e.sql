-- Audit table for club_members.ladder_position changes
CREATE TABLE IF NOT EXISTS public.club_member_ladder_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  old_position integer,
  new_position integer,
  changed_by uuid,
  change_source text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_member_ladder_history_club ON public.club_member_ladder_history(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_member_ladder_history_member ON public.club_member_ladder_history(club_member_id, created_at DESC);

ALTER TABLE public.club_member_ladder_history ENABLE ROW LEVEL SECURITY;

-- Only club admins can read history
CREATE POLICY "Club admins can view ladder history"
ON public.club_member_ladder_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_member_ladder_history.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
);

-- Trigger: log every change
CREATE OR REPLACE FUNCTION public.log_ladder_position_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.ladder_position, -1) IS DISTINCT FROM COALESCE(NEW.ladder_position, -1) THEN
    INSERT INTO public.club_member_ladder_history (
      club_member_id, club_id, old_position, new_position, changed_by, change_source
    ) VALUES (
      NEW.id, NEW.club_id, OLD.ladder_position, NEW.ladder_position, auth.uid(),
      COALESCE(current_setting('app.ladder_change_source', true), 'app')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ladder_position_change ON public.club_members;
CREATE TRIGGER trg_log_ladder_position_change
AFTER UPDATE OF ladder_position ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.log_ladder_position_change();

-- Drop the bulk renumber function so it can never accidentally rerun
DROP FUNCTION IF EXISTS public.renumber_club_ladder() CASCADE;
DROP FUNCTION IF EXISTS public.renumber_club_ladder(uuid) CASCADE;