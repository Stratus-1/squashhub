CREATE OR REPLACE FUNCTION public.club_accepts_membership_applications(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.clubs WHERE id = _club_id AND sla_accepted_at IS NOT NULL) $$;
REVOKE ALL ON FUNCTION public.club_accepts_membership_applications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_accepts_membership_applications(uuid) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.club_accepts_membership_applications(uuid) IS 'Public application availability only; exposes no SLA signer, date or billing details.';

DO $$
DECLARE definition text; marker text;
BEGIN
  definition := pg_get_functiondef('public.apply_to_club_as_existing_person(uuid)'::regprocedure);
  marker := '  SELECT name, email, phone, gender, person_id INTO v_src';
  IF position(marker IN definition) = 0 THEN RAISE EXCEPTION 'Application function changed; review required'; END IF;
  definition := replace(definition, marker, E'  IF NOT public.club_accepts_membership_applications(p_club_id) THEN\n    RAISE EXCEPTION ''APPLICATIONS_UNAVAILABLE: This club is not yet fully subscribed to SquashHub. Please apply directly through the club website or contact the club.'';\n  END IF;\n\n' || marker);
  EXECUTE definition;

  definition := pg_get_functiondef('public.join_club_request(uuid)'::regprocedure);
  marker := '  INSERT INTO public.club_members (club_id, user_id, name, email, phone, role, is_pending_approval)';
  IF position(marker IN definition) = 0 THEN RAISE EXCEPTION 'Join function changed; review required'; END IF;
  definition := replace(definition, marker, E'  IF NOT public.club_accepts_membership_applications(p_club_id) THEN\n    RAISE EXCEPTION ''APPLICATIONS_UNAVAILABLE: This club is not yet fully subscribed to SquashHub. Please apply directly through the club website or contact the club.'';\n  END IF;\n\n' || marker);
  EXECUTE definition;

  definition := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  marker := '    SELECT EXISTS (SELECT 1 FROM public.club_members WHERE club_id = v_club_id AND role = ''admin''),';
  IF position(marker IN definition) = 0 THEN RAISE EXCEPTION 'Signup function changed; review required'; END IF;
  definition := replace(definition, marker, E'    -- Keep authentication and existing-member linking available, but create no new membership at unsigned clubs.\n    IF NOT public.club_accepts_membership_applications(v_club_id) THEN\n      RETURN NEW;\n    END IF;\n\n' || marker);
  EXECUTE definition;
END $$;