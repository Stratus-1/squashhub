CREATE OR REPLACE FUNCTION public.tournament_public_summary(p_champ_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_champ record;
  v_club record;
BEGIN
  SELECT id, name, club_id, status, start_date, end_date, entries_locked
    INTO v_champ
  FROM public.club_champs WHERE id = p_champ_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;

  RETURN jsonb_build_object(
    'found', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'status', v_champ.status,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'entries_locked', COALESCE(v_champ.entries_locked, false),
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tournament_public_summary(uuid) TO anon, authenticated, service_role;