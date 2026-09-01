CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_club record;
  v_member record;
  v_group int;
  v_label text;
  v_name text;
  v_closed boolean := false;
  v_kind text;
  v_is_invitee boolean;
  v_divisions jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;
  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  SELECT e.group_number INTO v_group
    FROM public.club_champs_entries e
   WHERE e.champ_id = v_reg.champ_id AND e.club_member_id = v_reg.club_member_id
   ORDER BY e.group_number LIMIT 1;

  IF v_group IS NOT NULL THEN
    v_label := COALESCE(NULLIF(v_champ.group_labels ->> v_group::text, ''), 'League ' || v_group::text);
  END IF;

  v_divisions := public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id);

  v_name := NULLIF(trim(COALESCE(v_member.name, '')), '');
  IF v_name IS NOT NULL AND position(' ' IN v_name) > 0 THEN
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  END IF;

  IF v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    v_closed := true;
  END IF;

  IF v_reg.invite_viewed_at IS NULL THEN
    UPDATE public.club_champs_registrations SET invite_viewed_at = now() WHERE id = v_reg.id;
  END IF;

  v_is_invitee := auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id;
  v_kind := CASE WHEN v_is_invitee THEN 'none' ELSE public.invite_verification_kind(v_reg.club_member_id) END;

  RETURN jsonb_build_object(
    'found', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'registration_opens_at', v_champ.registration_opens_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'gender', v_champ.gender,
    'match_type', v_champ.match_type,
    'scoring_mode', v_champ.scoring_mode,
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'division_label', v_label,
    'divisions', v_divisions,
    'selected_divisions', to_jsonb(COALESCE(v_reg.division_choices, '{}')),
    'scheduling_mode', COALESCE(v_champ.scheduling_mode, 'club'),
    'invitee_name', v_name,
    'status', v_reg.status,
    'confirmed_at', v_reg.confirmed_at,
    'declined_at', v_reg.declined_at,
    'viewed_at', COALESCE(v_reg.invite_viewed_at, now()),
    'revoked', v_reg.invite_revoked_at IS NOT NULL,
    'registration_closed', v_closed,
    'tournament_status', v_champ.status,
    'member_has_account', v_member.user_id IS NOT NULL,
    'can_respond_public', true,
    'verification_kind', v_kind,
    'requires_login', false,
    'is_invitee', v_is_invitee
  );
END;
$function$;