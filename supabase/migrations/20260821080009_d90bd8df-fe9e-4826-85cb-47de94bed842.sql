CREATE OR REPLACE FUNCTION public.get_tournament_invite_preview(p_champ_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_champ record;
  v_club record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;

  RETURN jsonb_build_object(
    'found', true,
    'test', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'divisions', public.tournament_division_options(p_champ_id, NULL),
    'selected_divisions', '[]'::jsonb,
    'scheduling_mode', COALESCE(v_champ.scheduling_mode, 'club'),
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'invitee_name', 'Test recipient',
    'status', 'invited',
    'verification_kind', 'none',
    'can_respond_public', true,
    'is_invitee', true
  );
END;
$function$;