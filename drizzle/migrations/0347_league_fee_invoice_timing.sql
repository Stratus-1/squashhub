ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS fee_invoice_timing text NOT NULL DEFAULT 'end_of_season',
  ADD COLUMN IF NOT EXISTS fee_annual_ladies numeric NULL;
ALTER TABLE public.league_associations DROP CONSTRAINT IF EXISTS league_associations_fee_invoice_timing_chk;
ALTER TABLE public.league_associations ADD CONSTRAINT league_associations_fee_invoice_timing_chk
  CHECK (fee_invoice_timing IN ('on_allocation','end_of_season'));

-- Shared writer: one unsent league-fee invoice per member, association and season. Never touches sent/paid rows.
CREATE OR REPLACE FUNCTION public._league_fee_upsert_draft(
  _club_id uuid, _member_id uuid, _assoc_id uuid, _season int, _amount numeric, _due date, _overwrite boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE la record; v_label text; v_ex record; v_seq int; v_inv text; v_prev text;
BEGIN
  SELECT * INTO la FROM public.league_associations WHERE id = _assoc_id AND club_id = _club_id;
  IF la.id IS NULL OR COALESCE(_amount,0) <= 0 THEN RETURN 'skipped'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _member_id AND club_id = _club_id) THEN RETURN 'skipped'; END IF;
  v_label := COALESCE(NULLIF(la.abbreviation,''), la.name) || ' League Fees ' || _season;
  SELECT * INTO v_ex FROM public.club_member_fee_payments
   WHERE club_member_id = _member_id AND fee_type = 'renewal' AND season_year = _season AND fee_label = v_label
   ORDER BY created_at LIMIT 1;
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.paid OR v_ex.invoice_email_sent_at IS NOT NULL OR NOT _overwrite THEN RETURN 'exists'; END IF;
    UPDATE public.club_member_fee_payments SET amount = _amount, invoice_due_date = _due, updated_at = now() WHERE id = v_ex.id;
    RETURN 'updated';
  END IF;
  UPDATE public.clubs SET next_invoice_seq = COALESCE(next_invoice_seq,1) + 1 WHERE id = _club_id
   RETURNING COALESCE(next_invoice_seq,1) - 1 INTO v_seq;
  v_inv := 'INV-' || _season || '-' || lpad(v_seq::text, 5, '0');
  -- Unsent drafts post nothing to the ledger; allow automatic creation during team allocation by any league admin.
  v_prev := current_setting('app.chairman_self_payment', true);
  PERFORM set_config('app.chairman_self_payment', 'on', true);
  INSERT INTO public.club_member_fee_payments
    (club_member_id, fee_type, fee_label, amount, paid, season_year, invoice_number, invoice_due_date, invoice_email_status)
  VALUES (_member_id, 'renewal', v_label, _amount, false, _season, v_inv, _due, 'pending');
  PERFORM set_config('app.chairman_self_payment', COALESCE(v_prev,''), true);
  RETURN 'created';
END $$;
REVOKE ALL ON FUNCTION public._league_fee_upsert_draft(uuid,uuid,uuid,int,numeric,date,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._league_fee_next_due(_month int, _day int)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE t date := (now() AT TIME ZONE 'Africa/Johannesburg')::date; d date; m int := COALESCE(_month,12); dd int := COALESCE(_day,1);
BEGIN
  d := make_date(extract(year from t)::int, m, 1) + (LEAST(dd, 28) - 1);
  IF d < t THEN d := (d + interval '1 year')::date; END IF;
  RETURN d;
END $$;

-- Invoice-when-allocated: placing a player (incl. reserves) in a regional league team creates an unsent invoice once.
CREATE OR REPLACE FUNCTION public.tg_league_fee_on_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lg record; la record; cm record; v_amt numeric; v_season int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.league_id IS NOT DISTINCT FROM OLD.league_id THEN RETURN NEW; END IF;
  SELECT id, association_id, season_year INTO lg FROM public.leagues WHERE id = NEW.league_id;
  IF lg.association_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO la FROM public.league_associations WHERE id = lg.association_id;
  IF la.id IS NULL OR la.fee_invoice_timing <> 'on_allocation' OR COALESCE(la.scope,'') <> 'region' OR la.active IS FALSE THEN RETURN NEW; END IF;
  SELECT id, club_id, gender INTO cm FROM public.club_members WHERE id = NEW.club_member_id;
  IF cm.id IS NULL OR cm.club_id <> la.club_id THEN RETURN NEW; END IF;
  v_amt := CASE WHEN lower(COALESCE(cm.gender,'')) IN ('ladies','female','f','woman','women')
                 THEN COALESCE(la.fee_annual_ladies, la.fee_annual) ELSE la.fee_annual END;
  v_season := COALESCE(lg.season_year, extract(year from now())::int);
  PERFORM public._league_fee_upsert_draft(la.club_id, cm.id, la.id, v_season, v_amt,
    public._league_fee_next_due(la.fee_due_month, la.due_day), false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_league_fee_on_allocation ON public.member_league_registrations;
CREATE TRIGGER trg_league_fee_on_allocation AFTER INSERT OR UPDATE OF league_id ON public.member_league_registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_league_fee_on_allocation();

-- Import: finance staff create/refresh unsent invoices from a list (both timing options).
CREATE OR REPLACE FUNCTION public.import_league_fee_invoices(
  p_club_id uuid, p_association_id uuid, p_season int, p_due date, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; res text; c int := 0; u int := 0; e int := 0; s int := 0;
BEGIN
  IF NOT public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'finance') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501'; END IF;
  IF NOT public.chairman_financial_write_allowed(p_club_id) THEN
    RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE = '42501'; END IF;
  IF p_season IS NULL OR p_due IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Invalid input'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    res := public._league_fee_upsert_draft(p_club_id, (r->>'member_id')::uuid, p_association_id, p_season,
      NULLIF(r->>'amount','')::numeric, p_due, true);
    IF res = 'created' THEN c := c + 1; ELSIF res = 'updated' THEN u := u + 1;
    ELSIF res = 'exists' THEN e := e + 1; ELSE s := s + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('created', c, 'updated', u, 'already_sent', e, 'skipped', s);
END $$;
REVOKE ALL ON FUNCTION public.import_league_fee_invoices(uuid,uuid,int,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_league_fee_invoices(uuid,uuid,int,date,jsonb) TO authenticated;