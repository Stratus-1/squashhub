CREATE OR REPLACE FUNCTION public._champ_fee_adjust(p_fee_id uuid, p_new_amount numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f record; v_club uuid; v_diff numeric; v_ref uuid; v_assessed numeric; v_applied numeric; v_outstanding numeric;
BEGIN
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND OR f.paid OR f.invoice_issued_at IS NOT NULL THEN RETURN p_fee_id; END IF;
  SELECT club_id INTO v_club FROM public.club_members WHERE id = f.club_member_id;
  -- The row amount is remaining debt after partial payments, not the original assessment.
  SELECT coalesce(sum(credit - debit), f.amount, 0) INTO v_assessed
  FROM public.club_journal_entries
  WHERE fee_payment_id = f.id AND club_id = v_club AND account = 'tournament_income';
  v_applied := greatest(v_assessed - coalesce(f.amount, 0), 0);
  v_diff := round(coalesce(p_new_amount, 0), 2) - v_assessed;
  IF v_diff = 0 THEN RETURN p_fee_id; END IF;
  v_outstanding := greatest(round(coalesce(p_new_amount, 0), 2) - v_applied, 0);
  v_ref := gen_random_uuid();
  IF v_club IS NOT NULL THEN
    INSERT INTO public.club_journal_entries (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
    VALUES (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'debtors', greatest(v_diff,0), greatest(-v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref),
           (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'tournament_income', greatest(-v_diff,0), greatest(v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref);
    INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, after_json, note)
    VALUES (v_club, v_ref, 'edit', auth.uid(),
      jsonb_build_object('fee_payment_id', f.id, 'from', v_assessed, 'to', p_new_amount, 'payment_applied', v_applied, 'outstanding', v_outstanding), p_note);
  END IF;
  IF coalesce(p_new_amount, 0) <= 0 THEN
    UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE fee_payment_id = f.id;
    DELETE FROM public.club_member_fee_payments WHERE id = f.id AND paid = false;
    RETURN NULL;
  END IF;
  UPDATE public.club_member_fee_payments SET amount = v_outstanding WHERE id = f.id;
  RETURN f.id;
END $function$;
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_registration_id uuid, p_accept boolean, p_divisions integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee_id uuid; v_due int;
  v_next_status text; v_allowed int[]; v_choices int[]; v_auto int;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL, confirmation_source = NULL
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int) INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices FROM unnest(p_divisions) x WHERE x = ANY (coalesce(v_allowed, '{}'));
    IF coalesce(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = p_registration_id;
  ELSIF coalesce(array_length(v_reg.division_choices, 1), 0) = 0 THEN
    v_auto := public.tournament_league_division_for(v_reg.champ_id, v_reg.club_member_id);
    IF v_auto IS NOT NULL THEN
      UPDATE public.club_champs_registrations SET division_choices = ARRAY[v_auto] WHERE id = p_registration_id;
    END IF;
  END IF;

  v_due := coalesce(public.champ_reg_own_due_cents(p_registration_id), 0);
  IF coalesce(v_champ.payment_required, false) AND v_due > 0 AND NOT public.champ_member_fee_paid(v_reg.champ_id, v_reg.club_member_id) THEN
    v_next_status := CASE WHEN v_reg.status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSIF coalesce(v_champ.payment_required, false) AND v_due > 0 THEN
    v_next_status := coalesce(v_reg.status, 'paid');
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         confirmed_at = coalesce(confirmed_at, now()),
         confirmed_by = coalesce(confirmed_by, auth.uid()),
         confirmation_source = coalesce(confirmation_source, 'rsvp')
   WHERE id = p_registration_id;

  IF coalesce(v_champ.payment_required, false) AND v_due > 0 THEN
    v_fee_id := public.refresh_tournament_entry_fee(p_registration_id);
  END IF;

  PERFORM public.apply_registration_division_choices(p_registration_id);
  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id, 'amount_cents', v_due);
END $function$;
CREATE OR REPLACE FUNCTION public.charge_tournament_entry_to_account(p_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_member record; v_fee_id uuid; v_amount numeric; v_paid boolean;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    IF NOT public.member_is_delegate_of(v_reg.club_member_id, auth.uid()) THEN
      RAISE EXCEPTION 'Not authorised for this registration';
    END IF;
  END IF;
  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RAISE EXCEPTION 'This entry is no longer active';
  END IF;
  IF lower(coalesce(v_reg.fee_status,'')) IN ('paid','waived') OR v_reg.paid_at IS NOT NULL OR coalesce(v_reg.fee_paid_cents,0) > 0 THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'already_paid');
  END IF;
  v_fee_id := public.ensure_tournament_entry_fee(p_registration_id);
  IF v_fee_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'no_fee');
  END IF;
  SELECT amount, paid INTO v_amount, v_paid FROM public.club_member_fee_payments WHERE id = v_fee_id;
  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('charged', true, 'already', true, 'fee_payment_id', v_fee_id, 'amount', v_amount);
  END IF;
  UPDATE public.club_champs_registrations
     SET fee_settled_via = 'account', fee_settled_via_at = now()
   WHERE id = p_registration_id AND fee_settled_via IS NULL;
  RETURN jsonb_build_object('charged', true, 'already', false, 'fee_payment_id', v_fee_id, 'amount', v_amount, 'fee_paid', coalesce(v_paid,false));
END;
$function$;
CREATE OR REPLACE FUNCTION public.derive_champ_registration_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_fee integer; v_timing text; s text := lower(coalesce(NEW.status,''));
  v_money boolean; v_fee_ok boolean; v_entry_ok boolean;
BEGIN
  SELECT coalesce(entry_fee_cents,0), coalesce(payment_timing,'on_entry') INTO v_fee, v_timing FROM club_champs WHERE id = NEW.champ_id;
  v_money := NEW.paid_at IS NOT NULL OR coalesce(NEW.fee_paid_cents,0) > 0;
  NEW.fee_status := CASE
    WHEN s = 'waived' THEN 'waived'
    WHEN v_money THEN 'paid'
    WHEN coalesce(v_fee,0) <= 0 THEN 'not_required'
    WHEN s = 'paid' THEN 'paid'
    WHEN NEW.fee_settled_via = 'account' THEN 'on_account'
    WHEN s = 'pending_eft' THEN 'pending'
    ELSE 'due' END;
  v_fee_ok := NEW.fee_status IN ('paid','waived','not_required','on_account');
  -- "Must the fee be paid before the entry is confirmed?" = No (after_acceptance):
  -- payment never gates the entry; the fee stays tracked separately in fee_status.
  v_entry_ok := v_fee_ok OR v_timing = 'after_acceptance';
  IF s IN ('cancelled','declined','withdrawn') THEN
    NEW.registration_status := 'declined';
  ELSIF NEW.registration_source = 'organiser' AND (v_entry_ok OR s IN ('paid','waived')) THEN
    NEW.registration_status := 'registered';
  ELSIF s IN ('paid','waived','registered','active') OR (NEW.confirmed_at IS NOT NULL AND v_entry_ok) THEN
    NEW.registration_status := 'registered';
  ELSE
    NEW.registration_status := 'invited';
  END IF;
  IF NEW.registration_status = 'registered' AND NEW.registration_source IS NULL THEN
    NEW.registration_source := CASE WHEN NEW.confirmed_at IS NOT NULL THEN 'player' ELSE 'organiser' END;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.ensure_tournament_entry_fee(p_registration_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg record; v_champ record; v_amount numeric; v_label text; v_fee_id uuid; v_bill_member uuid;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN RETURN v_reg.fee_payment_id; END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_amount := coalesce(public.champ_reg_own_due_cents(p_registration_id), 0)::numeric / 100;
  IF v_amount <= 0 THEN RETURN NULL; END IF;
  v_label := coalesce(v_champ.name, 'Tournament') || ' entry fee';
  v_bill_member := public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id);
  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_bill_member, 'tournament_entry', v_label, v_amount, false,
          EXTRACT(YEAR FROM coalesce(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_fee_id;
  IF v_fee_id IS NOT NULL THEN
    PERFORM public._champ_fee_adjust(v_fee_id, v_amount, 'Entry fee set to the events entered');
  END IF;
  UPDATE public.club_champs_registrations SET fee_payment_id = coalesce(fee_payment_id, v_fee_id) WHERE id = p_registration_id;
  RETURN v_fee_id;
END $function$;
CREATE OR REPLACE FUNCTION public.family_activate_approved(_family_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.club_family_members%ROWTYPE;
  v_group public.club_family_groups%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_primary public.club_members%ROWTYPE;
  v_cat public.member_fee_categories%ROWTYPE;
  v_add_cat public.member_fee_categories%ROWTYPE;
  v_year int := EXTRACT(year FROM now())::int;
  v_amount numeric;
  v_months int;
BEGIN
  SELECT * INTO v_row FROM public.club_family_members WHERE id = _family_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_row.status <> 'invited' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_row.club_member_id;
  IF v_row.approval_status <> 'approved' OR v_row.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Family addition needs acceptance and admin approval';
  END IF;
  SELECT * INTO v_group FROM public.club_family_groups WHERE id = v_row.family_group_id;
  SELECT * INTO v_primary FROM public.club_members WHERE id = v_group.primary_member_id;
  SELECT * INTO v_cat FROM public.member_fee_categories WHERE id = v_primary.fee_category_id;
  IF NOT FOUND OR COALESCE(v_cat.family_role,'') <> 'primary' THEN
    RAISE EXCEPTION 'The family package is no longer active';
  END IF;
  SELECT * INTO v_add_cat FROM public.member_fee_categories WHERE id = v_cat.family_additional_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club has not set an Additional Family Member category'; END IF;

  UPDATE public.club_family_members
     SET status = 'active', confirmed_at = now(), updated_at = now()
   WHERE id = _family_member_id;

  IF v_row.is_new_member THEN
    UPDATE public.club_members SET is_pending_approval=false, approved_at=v_row.approved_at, approved_by=v_row.approved_by WHERE id=v_member.id;
  END IF;

  UPDATE public.club_members SET fee_category_id = v_add_cat.id, updated_at = now()
   WHERE id = v_member.id;

  v_amount := COALESCE(v_add_cat.annual_fee, 0);
  IF COALESCE(v_add_cat.pro_rate, false) AND v_amount > 0 THEN
    v_months := GREATEST(1, 12 - EXTRACT(month FROM now())::int + 1);
    v_amount := round(v_amount * v_months / 12.0, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
     WHERE f.club_member_id = v_member.id AND f.fee_type = 'club' AND f.season_year = v_year
  ) THEN
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, season_year, paid_by_member_id, family_group_id)
    VALUES (v_member.id, 'club', 'Club – Additional Family Member', v_amount, false, v_year,
            v_primary.id, v_group.id);
  ELSE
    UPDATE public.club_member_fee_payments
       SET paid_by_member_id = v_primary.id, family_group_id = v_group.id
     WHERE club_member_id = v_member.id AND fee_type = 'club' AND season_year = v_year AND paid = false;
  END IF;

  INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
  VALUES (v_primary.user_id, v_primary.id, 'Family package request accepted',
          COALESCE(v_member.name,'That member') || ' accepted and is now on your family package.',
          'general', '/my-account');

  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_chairman_financial_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE j jsonb; oldj jsonb; cid uuid;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN COALESCE(NEW,OLD); END IF;
 j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oldj:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 cid:=nullif(j->>'club_id','')::uuid;
 IF TG_TABLE_NAME='clubs' THEN cid:=(j->>'id')::uuid; END IF;
 IF cid IS NULL AND j ? 'club_member_id' THEN SELECT club_id INTO cid FROM public.club_members WHERE id=(j->>'club_member_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'batch_id' THEN SELECT club_id INTO cid FROM public.club_association_payable_batches WHERE id=(j->>'batch_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'champ_id' THEN SELECT club_id INTO cid FROM public.tournaments WHERE id=(j->>'champ_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'item_id' THEN SELECT club_id INTO cid FROM public.bar_items WHERE id=(j->>'item_id')::uuid; END IF;
 IF TG_OP='UPDATE' AND oldj ? 'club_id' AND oldj->>'club_id' IS DISTINCT FROM j->>'club_id' AND NOT public.chairman_financial_write_allowed(nullif(oldj->>'club_id','')::uuid) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF; IF public.chairman_financial_write_allowed(cid) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF public.chairman_banking_setup_change_allowed(TG_TABLE_NAME,TG_OP,j,oldj) THEN RETURN COALESCE(NEW,OLD); END IF; IF TG_TABLE_NAME='club_secrets' AND TG_OP='UPDATE' THEN IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ '(bank|payment|gateway|stitch|yoco|payfast|recurring)') THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF; RETURN NEW; END IF; IF TG_TABLE_NAME='clubs' AND TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND (e.key ~ '(bank|payment|gateway|fee|billing|recurring|credit|payday)' OR e.key='chairman_member_id')) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='club_members' THEN IF (TG_OP='DELETE' AND oldj->>'user_id'=auth.uid()::text) OR (TG_OP='UPDATE' AND oldj->>'user_id'=auth.uid()::text AND (j->'user_id' IS DISTINCT FROM oldj->'user_id' OR j->'club_id' IS DISTINCT FROM oldj->'club_id')) THEN RAISE EXCEPTION 'Chairman cannot remove their own permission identity' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND j->'fee_category_id' IS DISTINCT FROM oldj->'fee_category_id' THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  RETURN COALESCE(NEW,OLD);
 END IF;
 IF TG_TABLE_NAME='league_associations' AND TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ '(fee|billing|debit|recurring|pro_rate|due_)') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='bar_items' AND TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ '(cost|price)') THEN RETURN NEW; END IF;
 IF coalesce(current_setting('app.chairman_self_payment',true),'')='on' THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='member_credit_transactions' AND TG_OP='INSERT' AND j->>'user_id'=auth.uid()::text AND j->>'status'='pending' AND EXISTS(SELECT 1 FROM public.club_members WHERE id=(j->>'club_member_id')::uuid AND user_id=auth.uid() AND club_id=cid) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501';
END $function$;
CREATE OR REPLACE FUNCTION public.journal_fee_assessment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_income_account public.gl_account;
  v_amount numeric;
  v_label text;
  v_ftype text;
BEGIN
  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  IF NEW.invoice_issued_at IS NULL
     AND NEW.invoice_due_date IS NOT NULL
     AND NEW.invoice_due_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  SELECT cm.club_id INTO v_club_id FROM public.club_members cm WHERE cm.id = NEW.club_member_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ftype := lower(COALESCE(NEW.fee_type, ''));
  v_label := 'Fee raised: ' || COALESCE(NEW.fee_label, 'membership');

  IF v_ftype LIKE '%visitor%' THEN
    v_income_account := 'visitor_income';
  ELSIF NEW.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
    v_income_account := 'league_fees_income';
  ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
    v_income_account := 'national_body_income';
  ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
    v_income_account := 'bar_income';
  ELSIF v_ftype LIKE '%tournament%' OR v_ftype LIKE '%champ%' OR v_ftype LIKE '%tourn%' THEN
    v_income_account := 'tournament_income';
  ELSE
    v_income_account := 'membership_income';
  END IF;

  v_ref := gen_random_uuid();

  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, v_income_account, 0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.refresh_tournament_entry_fee(p_registration_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; ch record; f record; x record; v_target numeric; v_have numeric; v_label text; v_bill uuid;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.confirmed_at IS NULL OR lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn','waived') THEN RETURN r.fee_payment_id; END IF;
  SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
  v_target := coalesce(public.champ_reg_own_due_cents(r.id), 0)::numeric / 100;
  IF r.fee_payment_id IS NULL THEN
    IF v_target > 0 AND r.fee_settled_via IS NULL AND lower(coalesce(r.status,'')) IN ('pending_payment','pending_eft') THEN
      RETURN public.ensure_tournament_entry_fee(r.id);
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = r.fee_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT f.paid AND f.invoice_issued_at IS NULL THEN
    RETURN public._champ_fee_adjust(f.id, v_target, 'Entry fee changed: events entered or partner cover changed');
  END IF;
  v_label := coalesce(ch.name, 'Tournament') || ' entry fee – additional events';
  v_bill := f.club_member_id;
  SELECT coalesce(sum(amount),0) INTO v_have FROM public.club_member_fee_payments
   WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label LIKE v_label || '%'
     AND season_year = f.season_year;
  IF v_target > coalesce(f.amount,0) + v_have THEN
    SELECT * INTO x FROM public.club_member_fee_payments
     WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label = v_label
       AND season_year = f.season_year AND NOT paid AND invoice_issued_at IS NULL;
    IF FOUND THEN
      PERFORM public._champ_fee_adjust(x.id, x.amount + (v_target - f.amount - v_have), 'Additional tournament event entered');
    ELSE
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (v_bill, 'tournament_entry',
              CASE WHEN v_have > 0 THEN v_label || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ')' ELSE v_label END,
              v_target - f.amount - v_have, false, f.season_year);
    END IF;
  END IF;
  RETURN f.id;
END $function$;
CREATE OR REPLACE FUNCTION public.review_membership_application(_member_id uuid, _approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid; v_user uuid; v_name text; v_cat uuid;
BEGIN
  SELECT club_id, user_id, name, fee_category_id INTO v_club, v_user, v_name, v_cat
  FROM public.club_members WHERE id = _member_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT (public.is_club_admin(auth.uid(), v_club)
          OR public.has_club_permission(auth.uid(), v_club, 'members')) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status='pending' AND status='invited') THEN
    PERFORM public.family_review_addition(id,_approve) FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status='pending' AND status='invited';
    RETURN;
  END IF;
  IF _approve AND EXISTS (SELECT 1 FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status='rejected') THEN
    RAISE EXCEPTION 'The family application was rejected; submit a new application before approving';
  END IF;
  IF _approve THEN
    IF v_cat IS NULL AND EXISTS (SELECT 1 FROM public.member_fee_categories WHERE club_id = v_club) THEN
      RAISE EXCEPTION 'Choose a membership fee category before approving';
    END IF;
    UPDATE public.club_members SET is_pending_approval = false, approved_at = now(), approved_by = auth.uid()
     WHERE id = _member_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, url)
      VALUES (v_user, 'membership_approved', 'Membership approved',
              'Your club membership has been approved. Welcome aboard!', '/');
    END IF;
  ELSE
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, url)
      VALUES (v_user, 'membership_declined', 'Membership application declined',
              'Your membership application was not approved. Please contact the club for details.', '/');
    END IF;
    DELETE FROM public.club_members WHERE id = _member_id AND is_pending_approval = true;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.seed_member_default_fees(p_club_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member       public.club_members%ROWTYPE;
  v_club_id      uuid;
  v_is_nsa_club  boolean;
  v_cat_name     text;
  v_cat_amount   numeric;
  v_year         int := EXTRACT(year FROM now())::int;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v_member.role::text, '') = 'visitor' THEN RETURN; END IF;

  v_club_id := v_member.club_id;

  SELECT EXISTS (
    SELECT 1 FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' AND COALESCE(active, true)
  ) INTO v_is_nsa_club;
  IF NOT v_is_nsa_club THEN RETURN; END IF;

  -- Club membership category fee only. League (NSA), national body (SSA) and
  -- other per-member pass-through fees are NOT seeded here any more; they are
  -- managed regionally/nationally and filtered down to clubs.
  IF v_member.fee_category_id IS NOT NULL THEN
    SELECT name, annual_fee INTO v_cat_name, v_cat_amount
    FROM public.member_fee_categories
    WHERE id = v_member.fee_category_id AND COALESCE(active, true);
    IF FOUND AND COALESCE(v_cat_amount, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.club_member_fee_payments f
         WHERE f.club_member_id = p_club_member_id
           AND f.fee_type = 'club'
           AND f.season_year = v_year
       ) THEN
      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, auto_seeded)
      VALUES
        (p_club_member_id, 'club', 'Club – ' || v_cat_name, v_cat_amount, true, now(), v_year, true)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
    END IF;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_registration_ensure_entry_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only raise the entry fee once the player has actually accepted their entry.
  -- Being invited (status pending_payment with no confirmation) must never bill anyone.
  IF NEW.fee_payment_id IS NULL
     AND NEW.confirmed_at IS NOT NULL
     AND lower(COALESCE(NEW.status, '')) IN ('pending_payment', 'pending_eft') THEN
    PERFORM public.ensure_tournament_entry_fee(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
