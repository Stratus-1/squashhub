-- Organiser "Save" in the Step-by-Step board must not erase doubles partners
-- that players chose themselves: when a picked event carries no partner, keep
-- the partner from the active doubles pair for that category.
CREATE OR REPLACE FUNCTION public.step_sync_admin_entrants(p_champ_id uuid, p_entrants jsonb, p_fee_due boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid;
  m record;
  v_ids uuid[] := '{}';
  v_added int := 0; v_updated int := 0; v_removed int := 0; v_refund int := 0;
  r record;
  v_fee record;
  v_ref uuid;
  v_partners jsonb;
  v_legacy uuid;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ_id;

  -- One registration per person; each picked event is one item in p_entrants.
  FOR m IN
    SELECT (x->>'memberId')::uuid AS member,
           array_agg(DISTINCT coalesce((x->>'division')::int, 1) ORDER BY coalesce((x->>'division')::int, 1)) AS divs,
           coalesce(jsonb_object_agg(coalesce((x->>'division')::int, 1)::text, x->>'partnerId')
                      FILTER (WHERE nullif(x->>'partnerId','') IS NOT NULL), '{}'::jsonb) AS partners
      FROM jsonb_array_elements(coalesce(p_entrants,'[]'::jsonb)) x
     GROUP BY (x->>'memberId')::uuid
  LOOP
    v_ids := v_ids || m.member;

    -- Player-made pairs fill events the organiser left without a partner.
    SELECT coalesce(jsonb_object_agg(q.g::text, q.other), '{}'::jsonb) INTO v_partners
      FROM (
        SELECT DISTINCT ON (p.group_number) p.group_number AS g,
               CASE WHEN p.member_a = m.member THEN p.member_b ELSE p.member_a END AS other
          FROM public.champ_doubles_pairs p
         WHERE p.champ_id = p_champ_id
           AND m.member IN (p.member_a, p.member_b)
           AND p.group_number = ANY (m.divs)
           AND lower(coalesce(p.status,'')) NOT IN ('cancelled','rejected','declined','withdrawn')
         ORDER BY p.group_number, (p.status = 'confirmed') DESC, p.updated_at DESC
      ) q;
    v_partners := v_partners || m.partners;  -- organiser's explicit partner wins
    SELECT (v_partners ->> k)::uuid INTO v_legacy
      FROM jsonb_object_keys(v_partners) k ORDER BY k::int LIMIT 1;

    SELECT * INTO r FROM public.club_champs_registrations WHERE champ_id = p_champ_id AND club_member_id = m.member;
    IF NOT FOUND THEN
      INSERT INTO public.club_champs_registrations
        (champ_id, club_member_id, partner_member_id, partner_confirmed, status, invited_by_admin,
         confirmed_at, confirmation_source, registration_source, division_choices, division_partners)
      VALUES (p_champ_id, m.member, v_legacy, v_legacy IS NOT NULL,
              CASE WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END, true,
              now(), 'admin', 'admin', m.divs, v_partners);
      v_added := v_added + 1;
    ELSIF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn') THEN
      UPDATE public.club_champs_registrations
         SET status = CASE WHEN paid_at IS NOT NULL OR coalesce(fee_paid_cents,0) > 0 THEN 'paid'
                           WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END,
             partner_member_id = v_legacy,
             partner_confirmed = v_legacy IS NOT NULL,
             division_choices = m.divs, division_partners = v_partners,
             invited_by_admin = true, confirmed_at = now(), confirmation_source = 'admin',
             registration_source = 'admin', declined_at = NULL
       WHERE id = r.id;
      PERFORM public.ensure_tournament_entry_fee(r.id);
      v_added := v_added + 1;
    ELSIF r.partner_member_id IS DISTINCT FROM v_legacy
       OR r.division_choices IS DISTINCT FROM m.divs
       OR r.division_partners IS DISTINCT FROM v_partners THEN
      UPDATE public.club_champs_registrations
         SET partner_member_id = v_legacy,
             partner_confirmed = v_legacy IS NOT NULL,
             division_choices = m.divs, division_partners = v_partners
       WHERE id = r.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- Organiser-entered players no longer picked at all: withdraw (history kept).
  FOR r IN
    SELECT * FROM public.club_champs_registrations
     WHERE champ_id = p_champ_id
       AND registration_source = 'admin'
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       AND NOT (club_member_id = ANY(v_ids))
  LOOP
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmation_source = 'withdrawn', declined_at = now(),
           partner_member_id = NULL, partner_confirmed = false
     WHERE id = r.id;
    v_removed := v_removed + 1;

    IF r.paid_at IS NOT NULL OR coalesce(r.fee_paid_cents,0) > 0 THEN
      v_refund := v_refund + 1;
    ELSIF r.fee_payment_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.club_champs_registrations o
                       WHERE o.fee_payment_id = r.fee_payment_id AND o.id <> r.id
                         AND lower(coalesce(o.status,'')) NOT IN ('cancelled','declined','withdrawn')) THEN
      SELECT * INTO v_fee FROM public.club_member_fee_payments WHERE id = r.fee_payment_id AND paid = false;
      IF FOUND AND coalesce(v_fee.amount,0) > 0 THEN
        v_ref := gen_random_uuid();
        INSERT INTO public.club_journal_entries
          (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
        VALUES
          (v_club, v_fee.club_member_id, NULL, 'tournament_income', v_fee.amount, 0, 'Tournament entry withdrawn – charge reversed: ' || coalesce(v_fee.fee_label,''), v_ref),
          (v_club, v_fee.club_member_id, NULL, 'debtors', 0, v_fee.amount, 'Tournament entry withdrawn – charge reversed: ' || coalesce(v_fee.fee_label,''), v_ref);
        INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
        VALUES (v_club, v_ref, 'reverse', auth.uid(),
                jsonb_build_object('registration_id', r.id, 'fee_payment_id', v_fee.id, 'amount', v_fee.amount, 'club_member_id', v_fee.club_member_id),
                'Organiser replaced/removed tournament entrant');
        UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE id = r.id;
        DELETE FROM public.club_member_fee_payments WHERE id = v_fee.id AND paid = false;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed, 'refund_needed', v_refund);
END;
$function$;