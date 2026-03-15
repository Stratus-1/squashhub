
-- Add missing columns and member-scoping to notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;

-- Index for member-scoped queries
CREATE INDEX IF NOT EXISTS idx_notifications_club_member_id ON public.notifications(club_member_id) WHERE club_member_id IS NOT NULL;

-- Auto-populate user_id from club_member when inserting with only club_member_id
CREATE OR REPLACE FUNCTION public.populate_notification_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resolved_user_id uuid;
BEGIN
  -- If club_member_id provided, try to resolve user_id
  IF NEW.club_member_id IS NOT NULL THEN
    -- First try the member's own user_id
    SELECT cm.user_id INTO resolved_user_id
    FROM public.club_members cm
    WHERE cm.id = NEW.club_member_id;

    IF resolved_user_id IS NOT NULL THEN
      IF NEW.user_id IS NULL THEN
        NEW.user_id := resolved_user_id;
      END IF;
    ELSE
      -- Member has no user_id — find a user who shares the same email (family account)
      SELECT cm2.user_id INTO resolved_user_id
      FROM public.club_members cm
      JOIN public.club_members cm2 ON cm2.club_id = cm.club_id AND cm2.email = cm.email AND cm2.user_id IS NOT NULL
      WHERE cm.id = NEW.club_member_id
      ORDER BY cm2.joined_at ASC
      LIMIT 1;

      IF resolved_user_id IS NOT NULL AND NEW.user_id IS NULL THEN
        NEW.user_id := resolved_user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS populate_notification_user_id_trigger ON public.notifications;
CREATE TRIGGER populate_notification_user_id_trigger
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_notification_user_id();

-- Update RLS to also allow viewing notifications for linked members
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = notifications.club_member_id
        AND cm.user_id = auth.uid()
    ))
    OR (club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      JOIN public.club_members cm2 ON cm2.club_id = cm.club_id AND cm2.email = cm.email
      WHERE cm.id = notifications.club_member_id
        AND cm2.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = notifications.club_member_id
        AND cm.user_id = auth.uid()
    ))
    OR (club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      JOIN public.club_members cm2 ON cm2.club_id = cm.club_id AND cm2.email = cm.email
      WHERE cm.id = notifications.club_member_id
        AND cm2.user_id = auth.uid()
    ))
  );

-- Allow inserts from authenticated users  
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update notify_on_match_events to include club_member_id
CREATE OR REPLACE FUNCTION public.notify_on_match_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submitter_name text;
  opponent_user_id uuid;
  opponent_member_id uuid;
  submitter_member_id uuid;
BEGIN
  -- On insert: notify the other player
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by IS NULL AND NEW.submitted_by_member_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Resolve submitter name
    IF NEW.submitted_by IS NOT NULL THEN
      SELECT name INTO submitter_name FROM public.profiles WHERE id = NEW.submitted_by;
    END IF;
    IF submitter_name IS NULL AND NEW.submitted_by_member_id IS NOT NULL THEN
      SELECT name INTO submitter_name FROM public.club_members WHERE id = NEW.submitted_by_member_id;
    END IF;

    -- Determine opponent by member_id first
    IF NEW.submitted_by_member_id IS NOT NULL THEN
      opponent_member_id := CASE
        WHEN NEW.submitted_by_member_id = NEW.player_a_member_id THEN NEW.player_b_member_id
        WHEN NEW.submitted_by_member_id = NEW.player_b_member_id THEN NEW.player_a_member_id
        ELSE NULL
      END;
    END IF;

    -- Determine opponent user_id  
    opponent_user_id := CASE
      WHEN NEW.submitted_by = NEW.player_a THEN NEW.player_b
      WHEN NEW.submitted_by = NEW.player_b THEN NEW.player_a
      ELSE NULL
    END;

    -- Don't notify self
    IF opponent_user_id = NEW.submitted_by AND opponent_member_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF opponent_user_id IS NOT NULL OR opponent_member_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
      VALUES (
        COALESCE(opponent_user_id, '00000000-0000-0000-0000-000000000000'),
        opponent_member_id,
        'Match result submitted',
        COALESCE(submitter_name, 'Your opponent') || ' submitted a match result vs you. Please confirm or dispute.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      );
    END IF;

    RETURN NEW;
  END IF;

  -- On update: confirmed changed to true
  IF TG_OP = 'UPDATE' AND NEW.confirmed IS TRUE AND OLD.confirmed IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
    VALUES
      (
        COALESCE(NEW.player_a, '00000000-0000-0000-0000-000000000000'),
        NEW.player_a_member_id,
        'Match confirmed',
        'Your match has been confirmed.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      ),
      (
        COALESCE(NEW.player_b, '00000000-0000-0000-0000-000000000000'),
        NEW.player_b_member_id,
        'Match confirmed',
        'Your match has been confirmed.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      );

    RETURN NEW;
  END IF;

  -- On update: disputed toggled true
  IF TG_OP = 'UPDATE' AND NEW.disputed IS TRUE AND OLD.disputed IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
    VALUES
      (
        COALESCE(NEW.player_a, '00000000-0000-0000-0000-000000000000'),
        NEW.player_a_member_id,
        'Match disputed',
        'This match has been disputed. An admin may review and resolve it.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      ),
      (
        COALESCE(NEW.player_b, '00000000-0000-0000-0000-000000000000'),
        NEW.player_b_member_id,
        'Match disputed',
        'This match has been disputed. An admin may review and resolve it.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      );

    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    SELECT ur.user_id, 'Match dispute requires review',
      'A match has been disputed and needs admin review.', 'match', '/admin',
      jsonb_build_object('match_id', NEW.id)
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role);

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
