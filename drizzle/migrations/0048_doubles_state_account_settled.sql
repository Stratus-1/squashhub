CREATE OR REPLACE FUNCTION public.get_doubles_pairing_state(p_champ_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
  v_rows jsonb;
  v_managed_rows jsonb;
  v_fee int;
  v_family boolean;
  v_due_count int;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  v_fee := COALESCE(public.champ_entry_fee_cents(p_champ_id), 0);
  v_family := public.champ_is_family_doubles(p_champ_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'origin', p.origin,
           'proposed_by_me', p.proposed_by = v_me,
           'partner_member_id', CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END,
           'partner_name', pm.name,
           'partner_club', pc.name,
           'pays_for_partner', p.pays_for_partner,
           'payer_is_me', p.payer_member_id = v_me,
           'fee_cents', public.champ_division_fee_cents(p_champ_id, p.group_number),
           'covered_by_partner', p.pays_for_partner AND p.payer_member_id IS DISTINCT FROM v_me,
           'my_fee_paid', public.champ_member_event_paid(p_champ_id, v_me, p.group_number),
           'partner_fee_paid', public.champ_member_event_paid(p_champ_id, CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END, p.group_number),
           'locked_at', p.locked_at,
           'created_at', p.created_at,
           'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members pm ON pm.id = CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END
    LEFT JOIN public.clubs pc ON pc.id = pm.club_id
   WHERE p.champ_id = p_champ_id
     AND v_me IN (p.member_a, p.member_b)
     AND p.status IN ('pending','awaiting_payment','confirmed');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'member_a', p.member_a,
           'member_a_name', a.name,
           'member_b', p.member_b,
           'member_b_name', b.name,
           'member_a_paid', public.champ_member_event_paid(p.champ_id, p.member_a, p.group_number),
           'member_b_paid', public.champ_member_event_paid(p.champ_id, p.member_b, p.group_number),
           'locked_at', p.locked_at,
           'created_at', p.created_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_managed_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members a ON a.id = p.member_a
    JOIN public.club_members b ON b.id = p.member_b
   WHERE p.champ_id = p_champ_id
     AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
     AND p.status IN ('pending','awaiting_payment','confirmed');

  SELECT COALESCE((SELECT public.champ_reg_own_due_cents(r.id)
                      FROM public.club_champs_registrations r
                     WHERE r.champ_id = p_champ_id AND r.club_member_id = v_me
                       AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
                       AND NOT public.champ_member_fee_settled(p_champ_id, v_me)
                     LIMIT 1), 0)
       + COALESCE((SELECT sum(public.champ_division_fee_cents(p_champ_id, p.group_number))
                      FROM public.champ_doubles_pairs p
                     WHERE p.champ_id = p_champ_id AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
                       AND p.pays_for_partner AND p.member_a <> p.member_b
                       AND p.status IN ('pending','awaiting_payment','confirmed')
                       AND NOT public.champ_member_event_paid(p_champ_id,
                             CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END, p.group_number)), 0)
    INTO v_due_count;

  RETURN jsonb_build_object(
    'member_id', v_me,
    'locked', public.champ_pairing_locked(p_champ_id),
    'family_mode', v_family,
    'entry_fee_cents', v_fee,
    'my_fee_paid', public.champ_member_fee_settled(p_champ_id, v_me),
    'amount_due_cents', COALESCE(v_due_count, 0),
    'pairs', v_rows,
    'managed_pairs', v_managed_rows
  );
END;
$function$;