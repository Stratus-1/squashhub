-- Multi-event entries: one registration per person, a list of events (division_choices)
-- and a doubles partner PER EVENT (division_partners: {"<group>": "<partner member id>"}).
-- partner_member_id stays as a legacy mirror (partner of the lowest doubles event).
ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS division_partners jsonb;
COMMENT ON COLUMN public.club_champs_registrations.division_partners IS
  'Per-event doubles partner: {"<group_number>": "<club_member_id>"}. NULL = legacy, use partner_member_id for every event.';

CREATE OR REPLACE FUNCTION public.registration_partner_for(r public.club_champs_registrations, p_group int)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN r.division_partners IS NULL THEN r.partner_member_id
              ELSE NULLIF(r.division_partners ->> p_group::text, '')::uuid END
$$;

CREATE OR REPLACE FUNCTION public.step_sync_admin_entrants(p_champ_id uuid, p_entrants jsonb, p_fee_due boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid;
  m record;
  v_ids uuid[] := '{}';
  v_added int := 0; v_updated int := 0; v_removed int := 0; v_refund int := 0;
  r record;
  v_fee record;
  v_ref uuid;
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
                      FILTER (WHERE nullif(x->>'partnerId','') IS NOT NULL), '{}'::jsonb) AS partners,
           (array_agg(nullif(x->>'partnerId','')::uuid ORDER BY coalesce((x->>'division')::int, 1))
              FILTER (WHERE nullif(x->>'partnerId','') IS NOT NULL))[1] AS legacy_partner
      FROM jsonb_array_elements(coalesce(p_entrants,'[]'::jsonb)) x
     GROUP BY (x->>'memberId')::uuid
  LOOP
    v_ids := v_ids || m.member;
    SELECT * INTO r FROM public.club_champs_registrations WHERE champ_id = p_champ_id AND club_member_id = m.member;
    IF NOT FOUND THEN
      INSERT INTO public.club_champs_registrations
        (champ_id, club_member_id, partner_member_id, partner_confirmed, status, invited_by_admin,
         confirmed_at, confirmation_source, registration_source, division_choices, division_partners)
      VALUES (p_champ_id, m.member, m.legacy_partner, m.legacy_partner IS NOT NULL,
              CASE WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END, true,
              now(), 'admin', 'admin', m.divs, m.partners);
      v_added := v_added + 1;
    ELSIF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn') THEN
      UPDATE public.club_champs_registrations
         SET status = CASE WHEN paid_at IS NOT NULL OR coalesce(fee_paid_cents,0) > 0 THEN 'paid'
                           WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END,
             partner_member_id = m.legacy_partner,
             partner_confirmed = m.legacy_partner IS NOT NULL,
             division_choices = m.divs, division_partners = m.partners,
             invited_by_admin = true, confirmed_at = now(), confirmation_source = 'admin',
             registration_source = 'admin', declined_at = NULL
       WHERE id = r.id;
      PERFORM public.ensure_tournament_entry_fee(r.id);
      v_added := v_added + 1;
    ELSIF r.partner_member_id IS DISTINCT FROM m.legacy_partner
       OR r.division_choices IS DISTINCT FROM m.divs
       OR r.division_partners IS DISTINCT FROM m.partners THEN
      UPDATE public.club_champs_registrations
         SET partner_member_id = m.legacy_partner,
             partner_confirmed = m.legacy_partner IS NOT NULL,
             division_choices = m.divs, division_partners = m.partners
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

-- Reconcile keeps every event of the surviving registrations.
CREATE OR REPLACE FUNCTION public.step_reconcile_admin_entrants(p_champ_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_losers uuid[] := '{}';
  v_fix jsonb := '{}'::jsonb;
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
       AND partner_member_id IS NOT NULL AND division_partners IS NULL
     GROUP BY partner_member_id HAVING count(*) > 1
  LOOP
    IF c.any_paid THEN CONTINUE; END IF;
    v_fix := v_fix || jsonb_build_object(c.target::text, c.claimants[1]);
    v_losers := v_losers || c.claimants[2:array_length(c.claimants,1)];
  END LOOP;

  IF array_length(v_losers,1) IS NULL THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'memberId', r.club_member_id,
           'partnerId', CASE WHEN r.division_partners IS NULL
                             THEN coalesce(v_fix->>(r.club_member_id::text), r.partner_member_id::text)
                             ELSE r.division_partners ->> d::text END,
           'division', d)), '[]'::jsonb)
    INTO v_list
    FROM public.club_champs_registrations r
    CROSS JOIN LATERAL unnest(CASE WHEN cardinality(r.division_choices) > 0 THEN r.division_choices ELSE ARRAY[1] END) d
   WHERE r.champ_id = p_champ_id AND r.registration_source = 'admin'
     AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
     AND NOT (r.club_member_id = ANY(v_losers));

  SELECT coalesce(entry_fee_cents,0) > 0 INTO v_fee FROM public.club_champs WHERE id = p_champ_id;
  RETURN public.step_sync_admin_entrants(p_champ_id, v_list, coalesce(v_fee,false));
END;
$function$;

-- Entries per event carry that event's partner.
CREATE OR REPLACE FUNCTION public.apply_registration_division_choices(p_registration_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r public.club_champs_registrations;
  gn int;
  v_choices int[];
  v_single boolean;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND OR COALESCE(array_length(r.division_choices, 1), 0) = 0 THEN RETURN; END IF;

  SELECT c.scoring_mode = 'time_capped_points' INTO v_single
    FROM public.club_champs c WHERE c.id = r.champ_id;

  v_choices := r.division_choices;
  IF COALESCE(v_single, false) AND array_length(v_choices, 1) > 1 THEN
    v_choices := ARRAY[v_choices[1]];
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = r.id;
  END IF;

  FOREACH gn IN ARRAY v_choices LOOP
    INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, partner_member_id)
    VALUES (r.champ_id, r.club_member_id, gn, public.registration_partner_for(r, gn))
    ON CONFLICT (champ_id, club_member_id, group_number) DO NOTHING;
  END LOOP;

  DELETE FROM public.club_champs_entries e
   WHERE e.champ_id = r.champ_id
     AND e.club_member_id = r.club_member_id
     AND NOT (e.group_number = ANY (v_choices));
END;
$function$;

-- Category guard checks each event against ITS partner.
CREATE OR REPLACE FUNCTION public.beta_tournament_category_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_types jsonb; v_club uuid; v_gender text; v_partner uuid; v_partner_gender text; v_type text; v_div int; v_match_type text;
BEGIN
  SELECT t.beta_lifecycle->'category_types', t.club_id INTO v_types, v_club FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_types IS NULL OR v_types = 'null'::jsonb THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled','declined','withdrawn') THEN RETURN NEW; END IF;
  IF NEW.division_choices IS NULL OR cardinality(NEW.division_choices) = 0 THEN
    RAISE EXCEPTION 'Choose an eligible category before entering this tournament';
  END IF;
  SELECT gender INTO v_gender FROM public.club_members WHERE id = NEW.club_member_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player is not a member of the tournament club'; END IF;
  FOREACH v_div IN ARRAY NEW.division_choices LOOP
    v_type := v_types ->> v_div::text;
    IF v_type IS NULL OR v_type NOT IN ('mens','ladies','mixed','open') THEN RAISE EXCEPTION 'Invalid tournament category'; END IF;
    IF (v_type = 'mens' AND lower(coalesce(v_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) OR (v_type = 'ladies' AND lower(coalesce(v_gender,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Player is not eligible for the selected category'; END IF;
    v_partner := CASE WHEN NEW.division_partners IS NULL THEN NEW.partner_member_id
                      ELSE NULLIF(NEW.division_partners ->> v_div::text, '')::uuid END;
    IF v_partner IS NOT NULL THEN
      SELECT gender INTO v_partner_gender FROM public.club_members WHERE id = v_partner AND club_id = v_club;
      IF NOT FOUND THEN RAISE EXCEPTION 'Partner is not a member of the tournament club'; END IF;
      IF (v_type = 'mens' AND lower(coalesce(v_partner_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) OR (v_type = 'ladies' AND lower(coalesce(v_partner_gender,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Partner is not eligible for the selected category'; END IF;
      SELECT coalesce(t.league_match_types ->> v_div::text, t.match_type) INTO v_match_type FROM public.tournaments t WHERE t.id = NEW.champ_id;
      IF v_type = 'mixed' AND v_match_type = 'doubles' AND NOT (((lower(coalesce(v_gender,'')) IN ('m','male','men','man','mens','men''s','gents')) AND (lower(coalesce(v_partner_gender,'')) IN ('f','female','ladies','lady','woman','women'))) OR ((lower(coalesce(v_partner_gender,'')) IN ('m','male','men','man','mens','men''s','gents')) AND (lower(coalesce(v_gender,'')) IN ('f','female','ladies','lady','woman','women')))) THEN RAISE EXCEPTION 'Mixed doubles requires one man and one lady'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS beta_tournament_category_guard_trigger ON public.club_champs_registrations;
CREATE TRIGGER beta_tournament_category_guard_trigger
  BEFORE INSERT OR UPDATE OF champ_id, club_member_id, partner_member_id, division_choices, division_partners, confirmed_at, status
  ON public.club_champs_registrations FOR EACH ROW EXECUTE FUNCTION public.beta_tournament_category_guard();

-- Draw validation is per event: a person may appear once per event, pairs checked per event.
CREATE OR REPLACE FUNCTION public.step_prepare_draw(p_champ_id uuid, p_spec jsonb, p_entries jsonb, p_rebuild boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  e jsonb; n_games int; n_played int; n_entries int := 0;
  v_member uuid; v_partner uuid; v_group int; seen text[] := '{}';
BEGIN
  IF NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this tournament' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.tournaments WHERE id = p_champ_id FOR UPDATE;
  IF jsonb_typeof(p_spec) <> 'object' OR p_spec->>'architecture' IS DISTINCT FROM 'structured' THEN
    RAISE EXCEPTION 'Refused: not a structured specification';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE winner_member_id IS NOT NULL
           OR COALESCE(lower(status),'') IN ('completed','confirmed','in_progress','live','walkover','forfeit'))
    INTO n_games, n_played FROM public.club_champs_matches WHERE champ_id = p_champ_id;
  IF n_games > 0 AND NOT p_rebuild THEN
    RAISE EXCEPTION 'draw_exists: this tournament already has % game(s). Use Rebuild draw.', n_games;
  END IF;
  IF n_played > 0 THEN
    RAISE EXCEPTION 'results_exist: % game(s) are played or started. The draw cannot be rebuilt; use "Rebuild unplayed games" instead.', n_played;
  END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_entries,'[]'::jsonb)) LOOP
    v_member := (e->>'member')::uuid; v_partner := NULLIF(e->>'partner','')::uuid; v_group := (e->>'group')::int;
    IF (v_group || ':' || v_member) = ANY(seen) OR (v_partner IS NOT NULL AND (v_group || ':' || v_partner) = ANY(seen)) THEN
      RAISE EXCEPTION 'pair_integrity: a player appears in the same event more than once';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.club_champs_registrations r
       WHERE r.champ_id = p_champ_id AND r.club_member_id = v_member
         AND COALESCE(r.status,'') NOT IN ('cancelled','withdrawn','declined')
         AND public.registration_partner_for(r, v_group) IS NOT DISTINCT FROM v_partner
         AND (r.division_choices IS NULL OR cardinality(r.division_choices) = 0 OR v_group = ANY(r.division_choices))) THEN
      RAISE EXCEPTION 'stale_entry: an entry is not a current active registration in that division';
    END IF;
    IF v_partner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.club_champs_registrations r
       WHERE r.champ_id = p_champ_id AND r.club_member_id = v_partner
         AND COALESCE(r.status,'') NOT IN ('cancelled','withdrawn','declined')
         AND public.registration_partner_for(r, v_group) = v_member) THEN
      RAISE EXCEPTION 'pair_integrity: a partner''s entry does not point back to the same pair';
    END IF;
    seen := seen || (v_group || ':' || v_member) || (v_group || ':' || COALESCE(v_partner, v_member));
  END LOOP;

  DELETE FROM public.club_champs_matches WHERE champ_id = p_champ_id;
  DELETE FROM public.club_champs_rounds WHERE champ_id = p_champ_id;
  DELETE FROM public.tournament_divisions WHERE tournament_id = p_champ_id;

  DELETE FROM public.club_champs_entries WHERE champ_id = p_champ_id;
  INSERT INTO public.club_champs_entries (champ_id, club_member_id, partner_member_id, group_number, order_index)
  SELECT p_champ_id, (x->>'member')::uuid, NULLIF(x->>'partner','')::uuid, (x->>'group')::int, COALESCE((x->>'order')::int, 0)
    FROM jsonb_array_elements(COALESCE(p_entries,'[]'::jsonb)) x;
  GET DIAGNOSTICS n_entries = ROW_COUNT;

  UPDATE public.tournaments SET builder_architecture = 'structured', builder_spec = p_spec WHERE id = p_champ_id;
  RETURN jsonb_build_object('entries', n_entries, 'removed_games', n_games);
END $function$;