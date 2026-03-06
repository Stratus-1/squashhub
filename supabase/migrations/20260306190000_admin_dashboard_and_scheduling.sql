-- Admin dashboard support
-- - Add scheduled_matches for admin-managed scheduling
-- - Add admin/moderator RLS policies for management
-- - Add RPC to safely move ladder ranks
-- - Bootstrap admin role for a specific email

-- 0) Helpers
CREATE OR REPLACE FUNCTION public.is_admin_or_moderator(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'moderator'::public.app_role)
$$;

-- 1) Admin/manager policies (profiles / bookings / challenges / matches / notifications / roles)
DO $$
BEGIN
  -- Profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can update any profile'
  ) THEN
    CREATE POLICY "Admins can update any profile"
      ON public.profiles FOR UPDATE TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- Bookings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'Admins can manage bookings'
  ) THEN
    CREATE POLICY "Admins can manage bookings"
      ON public.bookings FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- Challenges
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'challenges' AND policyname = 'Admins can manage challenges'
  ) THEN
    CREATE POLICY "Admins can manage challenges"
      ON public.challenges FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- Matches
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'matches' AND policyname = 'Admins can manage matches'
  ) THEN
    CREATE POLICY "Admins can manage matches"
      ON public.matches FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- Notifications (admins can create)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Admins can create notifications'
  ) THEN
    CREATE POLICY "Admins can create notifications"
      ON public.notifications FOR INSERT TO authenticated
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- User roles (admin-only management; moderators can read)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can view all roles'
  ) THEN
    CREATE POLICY "Admins can view all roles"
      ON public.user_roles FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can manage roles'
  ) THEN
    CREATE POLICY "Admins can manage roles"
      ON public.user_roles FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can update roles'
  ) THEN
    CREATE POLICY "Admins can update roles"
      ON public.user_roles FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can delete roles'
  ) THEN
    CREATE POLICY "Admins can delete roles"
      ON public.user_roles FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- 2) Allow admins/managers to override challenge status transitions
CREATE OR REPLACE FUNCTION public.validate_challenge_update()
RETURNS TRIGGER AS $$
DECLARE
  uid uuid;
  match_confirmed boolean;
BEGIN
  uid := auth.uid();

  IF uid IS NOT NULL AND public.is_admin_or_moderator(uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- pending -> accepted (only opponent can accept)
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      IF uid IS NULL OR uid <> OLD.opponent_id THEN
        RAISE EXCEPTION 'Only the challenged player can accept this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- pending -> declined (opponent declines OR challenger withdraws)
    IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
      IF uid IS NULL OR (uid <> OLD.opponent_id AND uid <> OLD.challenger_id) THEN
        RAISE EXCEPTION 'Only participants can decline or withdraw this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- accepted -> completed (only after confirmed match exists)
    IF OLD.status = 'accepted' AND NEW.status = 'completed' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.matches
        WHERE challenge_id = OLD.id
          AND confirmed = true
      ) INTO match_confirmed;

      IF NOT match_confirmed THEN
        RAISE EXCEPTION 'Cannot complete a challenge without a confirmed match';
      END IF;
      RETURN NEW;
    END IF;

    -- No other transitions allowed
    RAISE EXCEPTION 'Invalid challenge status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Admin ladder management RPC (safe rank movement without unique collisions)
CREATE OR REPLACE FUNCTION public.admin_set_rank(target_user_id uuid, new_rank integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  current_rank integer;
  max_rank integer;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF new_rank IS NOT NULL AND (new_rank < 1 OR new_rank > 20) THEN
    RAISE EXCEPTION 'new_rank must be between 1 and 20 (or null)';
  END IF;

  -- serialize rank edits
  PERFORM pg_advisory_xact_lock(923402);

  SELECT rank INTO current_rank
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_rank IS NOT DISTINCT FROM new_rank THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(rank), 0) INTO max_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  -- Remove from ladder: shift everyone above up by 1
  IF new_rank IS NULL THEN
    IF current_rank IS NULL THEN
      RETURN;
    END IF;

    UPDATE public.profiles
    SET rank = rank + 100
    WHERE rank BETWEEN current_rank + 1 AND 20;

    UPDATE public.profiles
    SET rank = NULL, updated_at = now()
    WHERE id = target_user_id;

    UPDATE public.profiles
    SET rank = rank - 101, updated_at = now()
    WHERE rank BETWEEN current_rank + 101 AND 120;

    RETURN;
  END IF;

  -- Insert from unranked: shift down from new_rank to 20; last may fall off (rank -> null)
  IF current_rank IS NULL THEN
    UPDATE public.profiles
    SET rank = rank + 100
    WHERE rank BETWEEN new_rank AND 20;

    UPDATE public.profiles
    SET rank = new_rank, updated_at = now()
    WHERE id = target_user_id;

    UPDATE public.profiles
    SET
      rank = CASE
        WHEN (rank - 99) > 20 THEN NULL
        ELSE (rank - 99)
      END,
      updated_at = now()
    WHERE rank BETWEEN new_rank + 100 AND 120;

    RETURN;
  END IF;

  -- Move within ladder
  IF new_rank < current_rank THEN
    -- Move up: [new_rank..current_rank-1] shift down
    UPDATE public.profiles
    SET rank = rank + 100
    WHERE rank BETWEEN new_rank AND current_rank - 1;

    UPDATE public.profiles
    SET rank = new_rank, updated_at = now()
    WHERE id = target_user_id;

    UPDATE public.profiles
    SET rank = rank - 99, updated_at = now()
    WHERE rank BETWEEN new_rank + 100 AND current_rank + 99;

  ELSE
    -- Move down: [current_rank+1..new_rank] shift up
    UPDATE public.profiles
    SET rank = rank + 100
    WHERE rank BETWEEN current_rank + 1 AND new_rank;

    UPDATE public.profiles
    SET rank = new_rank, updated_at = now()
    WHERE id = target_user_id;

    UPDATE public.profiles
    SET rank = rank - 101, updated_at = now()
    WHERE rank BETWEEN current_rank + 101 AND new_rank + 100;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_rank(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_rank(uuid, integer) TO authenticated;

-- 4) Scheduling table (admin-managed)
CREATE TABLE IF NOT EXISTS public.scheduled_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  player_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  court_id integer REFERENCES public.courts(id),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_matches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scheduled_matches' AND policyname = 'Participants can view scheduled matches'
  ) THEN
    CREATE POLICY "Participants can view scheduled matches"
      ON public.scheduled_matches FOR SELECT TO authenticated
      USING (
        auth.uid() = player_a OR auth.uid() = player_b OR public.is_admin_or_moderator(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scheduled_matches' AND policyname = 'Admins can manage scheduled matches'
  ) THEN
    CREATE POLICY "Admins can manage scheduled matches"
      ON public.scheduled_matches FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_scheduled_matches_updated_at ON public.scheduled_matches;
CREATE TRIGGER update_scheduled_matches_updated_at
  BEFORE UPDATE ON public.scheduled_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Bootstrap admin user role (by email) + ensure new signups auto-grant
DO $$
DECLARE
  admin_email text := 'danielmommsen@hotmail.com';
  admin_user_id uuid;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = admin_email
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- Recreate handle_new_user with rank assignment + admin bootstrap by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  next_rank integer;
BEGIN
  -- serialize rank assignment to avoid duplicates
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  IF next_rank > 20 THEN
    next_rank := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, email, rank)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    next_rank
  );

  IF NEW.email = 'danielmommsen@hotmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

