-- Mobile-only bridge to the existing tournament invite business rules.
-- The Player API authenticates the Google session, selects this exact member,
-- and supplies the internal secret. All tournament rules remain owned by the
-- existing accept_tournament_invite RPC and registration records.
CREATE OR REPLACE FUNCTION public.mobile_tournament_notification(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_notification_id uuid,
  p_action text DEFAULT 'context',
  p_divisions integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_notification public.notifications%ROWTYPE;
  v_registration public.club_champs_registrations%ROWTYPE;
  v_champ public.club_champs%ROWTYPE;
  v_kind text;
  v_result jsonb;
  v_read jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('context', 'accept', 'decline') THEN
    RAISE EXCEPTION 'Unsupported tournament notification action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_member_id AND club_id = p_club_id;
  IF NOT FOUND OR v_member.is_pending_approval
     OR lower(COALESCE(v_member.status::text, '')) IN ('resigned', 'cancelled', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Active player membership was not found for this club' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_notification
  FROM public.notifications
  WHERE id = p_notification_id AND club_member_id = p_member_id
    AND type IN ('tournament_invite', 'tournament_partner_invite');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament invitation was not found for this player' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT * INTO v_registration
    FROM public.club_champs_registrations
    WHERE id = NULLIF(v_notification.data->>'registration_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Tournament invitation is missing its registration link' USING ERRCODE = '22023';
  END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament registration was not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_registration.champ_id;
  IF NOT FOUND OR v_champ.club_id <> p_club_id
     OR v_notification.data->>'champ_id' IS DISTINCT FROM v_registration.champ_id::text THEN
    RAISE EXCEPTION 'Tournament invitation does not belong to this club' USING ERRCODE = '42501';
  END IF;

  IF v_notification.type = 'tournament_invite' THEN
    v_kind := 'entry';
    IF v_registration.club_member_id <> p_member_id THEN
      RAISE EXCEPTION 'Tournament entry is not assigned to this player' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_kind := 'partner';
    IF v_registration.partner_member_id <> p_member_id THEN
      RAISE EXCEPTION 'Partner invitation is not assigned to this player' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'context' THEN
    RETURN jsonb_build_object(
      'kind', v_kind,
      'registrationId', v_registration.id,
      'tournamentId', v_registration.champ_id,
      'tournamentName', v_champ.name,
      'registrationStatus', v_registration.status,
      'partnerConfirmed', v_registration.partner_confirmed,
      'divisionChoices', COALESCE(to_jsonb(v_registration.division_choices), '[]'::jsonb),
      'divisionOptions', CASE WHEN v_kind = 'entry'
        THEN public.tournament_division_options(v_registration.champ_id, p_member_id)
        ELSE '[]'::jsonb END
    );
  END IF;

  IF lower(COALESCE(v_registration.status, '')) IN ('cancelled', 'declined', 'withdrawn') THEN
    RAISE EXCEPTION 'This tournament invitation is no longer active' USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'entry' THEN
    IF v_member.user_id IS NULL THEN
      RAISE EXCEPTION 'This membership is not linked to a SquashHub login' USING ERRCODE = '42501';
    END IF;
    -- The existing web RPC requires the authenticated member identity. The
    -- Player API has already verified this member against the Google session.
    PERFORM set_config('request.jwt.claim.sub', v_member.user_id::text, true);
    v_result := public.accept_tournament_invite(
      v_registration.id,
      p_action = 'accept',
      CASE WHEN p_action = 'accept' THEN p_divisions ELSE NULL END
    );
  ELSE
    IF v_registration.partner_confirmed THEN
      RAISE EXCEPTION 'This partner invitation has already been answered' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'accept' THEN
      UPDATE public.club_champs_registrations
      SET partner_confirmed = true
      WHERE id = v_registration.id AND champ_id = v_registration.champ_id
        AND partner_member_id = p_member_id AND partner_confirmed = false;
    ELSE
      UPDATE public.club_champs_registrations
      SET partner_member_id = NULL, partner_confirmed = false
      WHERE id = v_registration.id AND champ_id = v_registration.champ_id
        AND partner_member_id = p_member_id AND partner_confirmed = false;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This partner invitation has already changed' USING ERRCODE = '40001';
    END IF;
    v_result := jsonb_build_object('status', CASE WHEN p_action = 'accept' THEN 'confirmed' ELSE 'declined' END);
  END IF;

  v_read := public.mobile_mark_notifications_read(
    p_sync_secret, p_club_id, p_member_id, ARRAY[p_notification_id]
  );
  IF COALESCE((v_read->>'count')::integer, 0) <> 1 THEN
    RAISE EXCEPTION 'Invitation action saved but its notification could not be marked read' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'action', p_action, 'result', v_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.mobile_tournament_notification(text, uuid, uuid, uuid, text, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_tournament_notification(text, uuid, uuid, uuid, text, integer[]) TO anon, authenticated, service_role;
