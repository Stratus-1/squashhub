-- Reconciles organiser-entered doubles left inconsistent by a replacement saved before
-- step_sync_admin_entrants existed: a player claimed as partner by two active entries.
-- The newest claimant is the incoming player; the older, unpaid claimant is withdrawn
-- through step_sync_admin_entrants (history kept, unpaid fee reversed with audit).
CREATE OR REPLACE FUNCTION public.step_reconcile_admin_entrants(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_losers uuid[] := '{}';
  v_fix jsonb := '{}'::jsonb;   -- partner member -> winning claimant
  c record;
  v_list jsonb;
  v_fee boolean;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;

  FOR c IN
    SELECT partner_member_id AS target,
           array_agg(club_member_id ORDER BY created_at DESC, id DESC) AS claimants,
           bool_or(paid_at IS NOT NULL OR coalesce(fee_paid_cents,0) > 0 OR status = 'paid') AS any_paid
      FROM public.club_champs_registrations
     WHERE champ_id = p_champ_id AND registration_source = 'admin'
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       AND partner_member_id IS NOT NULL
     GROUP BY partner_member_id HAVING count(*) > 1
  LOOP
    IF c.any_paid THEN CONTINUE; END IF;  -- money involved: leave for the organiser
    v_fix := v_fix || jsonb_build_object(c.target::text, c.claimants[1]);
    v_losers := v_losers || c.claimants[2:array_length(c.claimants,1)];
  END LOOP;

  IF array_length(v_losers,1) IS NULL THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'memberId', r.club_member_id,
           'partnerId', coalesce(v_fix->>(r.club_member_id::text), r.partner_member_id::text),
           'division', coalesce(r.division_choices[1], 1))), '[]'::jsonb)
    INTO v_list
    FROM public.club_champs_registrations r
   WHERE r.champ_id = p_champ_id AND r.registration_source = 'admin'
     AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
     AND NOT (r.club_member_id = ANY(v_losers));

  SELECT coalesce(entry_fee_cents,0) > 0 INTO v_fee FROM public.club_champs WHERE id = p_champ_id;
  RETURN public.step_sync_admin_entrants(p_champ_id, v_list, coalesce(v_fee,false));
END;
$$;
REVOKE ALL ON FUNCTION public.step_reconcile_admin_entrants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.step_reconcile_admin_entrants(uuid) TO authenticated, service_role;