-- Auto-create member_league_registrations rows when a club_member with plays_league=true
-- has a club_member_number that matches a platform_league_members.user_code in any
-- association linked to one of the club's leagues.
--
-- This eliminates the need for the onboarding wizard to "discover" and persist NSF/league codes.

CREATE OR REPLACE FUNCTION public.auto_create_league_registration_for_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_league record;
  v_match_assoc_id uuid;
BEGIN
  -- Only act when the member plays league and has a member number to use as a code
  IF NEW.plays_league IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_code := TRIM(COALESCE(NEW.club_member_number, ''));
  IF v_code = '' THEN
    RETURN NEW;
  END IF;

  -- For each league the club has, see if the code exists in platform_league_members
  -- under the league's association. If so, upsert a registration with the code.
  FOR v_league IN
    SELECT l.id AS league_id, l.association_id, la.platform_association_id
    FROM public.leagues l
    LEFT JOIN public.league_associations la ON la.id = l.association_id
    WHERE l.club_id = NEW.club_id
  LOOP
    v_match_assoc_id := NULL;

    -- Prefer the platform association linked to the league
    IF v_league.platform_association_id IS NOT NULL THEN
      PERFORM 1 FROM public.platform_league_members
        WHERE association_id = v_league.platform_association_id
          AND LOWER(user_code) = LOWER(v_code)
        LIMIT 1;
      IF FOUND THEN
        v_match_assoc_id := v_league.platform_association_id;
      END IF;
    END IF;

    -- Skip leagues where we can't confirm the code belongs to that association
    IF v_match_assoc_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Upsert the registration; only fill league_association_number when blank
    INSERT INTO public.member_league_registrations
      (club_member_id, league_id, league_association_number)
    VALUES
      (NEW.id, v_league.league_id, v_code)
    ON CONFLICT (club_member_id, league_id) DO UPDATE
      SET league_association_number = COALESCE(
            NULLIF(public.member_league_registrations.league_association_number, ''),
            EXCLUDED.league_association_number
          ),
          updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_create_league_registration ON public.club_members;
CREATE TRIGGER trg_auto_create_league_registration
AFTER INSERT OR UPDATE OF plays_league, club_member_number ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_league_registration_for_member();