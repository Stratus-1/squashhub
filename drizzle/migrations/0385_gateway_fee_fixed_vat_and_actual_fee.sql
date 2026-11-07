ALTER TABLE public.payment_gateway_fee_defaults
  ADD COLUMN IF NOT EXISTS fee_fixed numeric NOT NULL DEFAULT 0 CHECK (fee_fixed >= 0 AND fee_fixed <= 100),
  ADD COLUMN IF NOT EXISTS add_vat boolean NOT NULL DEFAULT false;
ALTER TABLE public.club_payment_gateway_fees
  ADD COLUMN IF NOT EXISTS fee_fixed numeric NOT NULL DEFAULT 0 CHECK (fee_fixed >= 0 AND fee_fixed <= 100),
  ADD COLUMN IF NOT EXISTS add_vat boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.payment_gateway_fee_defaults.fee_fixed IS 'Fixed rand fee per payment (before VAT when add_vat)';
COMMENT ON COLUMN public.payment_gateway_fee_defaults.add_vat IS 'When true, 15% VAT is added on top of percentage + fixed fee';

-- Resolves the fee rule (percentage, fixed rand, VAT on top) for a club/method.
CREATE OR REPLACE FUNCTION public.club_gateway_fee_rule(_club_id uuid, _method text DEFAULT NULL::text,
  OUT fee_pct numeric, OUT fee_fixed numeric, OUT add_vat boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_provider text; v_method text; c record; r record;
BEGIN
  SELECT payment_gateway, bar_card_provider INTO c FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF lower(COALESCE(_method,'')) = 'bar_card' THEN
    v_provider := lower(COALESCE(NULLIF(c.bar_card_provider,''), c.payment_gateway, 'payfast'));
    v_method := 'card';
  ELSE
    v_provider := lower(COALESCE(c.payment_gateway, 'payfast'));
    v_method := CASE lower(COALESCE(_method,'')) WHEN 'wallet' THEN 'wallet' WHEN 'capitec' THEN 'capitec' ELSE 'card' END;
  END IF;
  SELECT f.fee_pct, f.fee_fixed, f.add_vat INTO r FROM public.club_payment_gateway_fees f WHERE f.club_id=_club_id AND f.provider=v_provider AND f.method=v_method;
  IF NOT FOUND THEN SELECT d.fee_pct, d.fee_fixed, d.add_vat INTO r FROM public.payment_gateway_fee_defaults d WHERE d.provider=v_provider AND d.method=v_method; END IF;
  IF NOT FOUND AND v_method <> 'card' THEN
    SELECT f.fee_pct, f.fee_fixed, f.add_vat INTO r FROM public.club_payment_gateway_fees f WHERE f.club_id=_club_id AND f.provider=v_provider AND f.method='card';
    IF NOT FOUND THEN SELECT d.fee_pct, d.fee_fixed, d.add_vat INTO r FROM public.payment_gateway_fee_defaults d WHERE d.provider=v_provider AND d.method='card'; END IF;
  END IF;
  IF r IS NULL OR r.fee_pct IS NULL THEN fee_pct := 3.70; fee_fixed := 0; add_vat := false; RETURN; END IF;
  fee_pct := r.fee_pct; fee_fixed := COALESCE(r.fee_fixed, 0); add_vat := COALESCE(r.add_vat, false);
END $$;
REVOKE ALL ON FUNCTION public.club_gateway_fee_rule(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_gateway_fee_rule(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.post_gateway_fee(_club_id uuid, _journal_ref uuid, _amount numeric, _desc text, _club_member_id uuid DEFAULT NULL::uuid, _method text DEFAULT NULL::text)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_fee numeric; v_label text; v_rule text;
  v_ref uuid := COALESCE(_journal_ref, gen_random_uuid());
BEGIN
  IF _club_id IS NULL OR COALESCE(_amount, 0) <= 0 THEN RETURN 0; END IF;
  SELECT * INTO r FROM public.club_gateway_fee_rule(_club_id, _method);
  IF COALESCE(r.fee_pct, 0) <= 0 AND COALESCE(r.fee_fixed, 0) <= 0 THEN RETURN 0; END IF;

  v_fee := round((_amount * COALESCE(r.fee_pct,0) / 100.0 + COALESCE(r.fee_fixed,0))
                 * CASE WHEN r.add_vat THEN 1.15 ELSE 1 END, 2);
  IF v_fee <= 0 THEN RETURN 0; END IF;

  IF EXISTS (SELECT 1 FROM public.club_journal_entries
             WHERE journal_ref = v_ref AND account = 'gateway_fees'::public.gl_account) THEN
    RETURN 0;
  END IF;

  v_rule := trim(to_char(COALESCE(r.fee_pct,0), 'FM999990.00')) || '%'
            || CASE WHEN COALESCE(r.fee_fixed,0) > 0 THEN ' + R' || trim(to_char(r.fee_fixed, 'FM999990.00')) ELSE '' END
            || CASE WHEN r.add_vat THEN ' + VAT' ELSE ' incl. VAT' END;
  v_label := COALESCE(_desc, 'Card payment') || ' — gateway fee (' || v_rule || ')';

  INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
  VALUES (_club_id, v_ref, 'gateway_fees'::public.gl_account, v_fee, 0, v_label, _club_member_id),
         (_club_id, v_ref, 'bank_current'::public.gl_account, 0, v_fee, v_label, _club_member_id);
  RETURN v_fee;
END;
$function$;

-- Brings the booked gateway fee for one payment to the fee the provider actually
-- charged, by posting one separate adjustment (never editing the original lines).
-- Idempotent: one adjustment per payment.
CREATE OR REPLACE FUNCTION public.post_gateway_fee_correction(_club_id uuid, _journal_ref uuid, _actual_fee numeric, _desc text DEFAULT NULL, _at timestamptz DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ref uuid; v_booked numeric; v_diff numeric; v_member uuid; v_at timestamptz; v_orig text; v_label text;
BEGIN
  IF _club_id IS NULL OR _journal_ref IS NULL OR _actual_fee IS NULL OR _actual_fee < 0 THEN RETURN 0; END IF;
  v_ref := md5(_journal_ref::text || ':actual-fee')::uuid;
  IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = v_ref) THEN RETURN 0; END IF;
  SELECT COALESCE(sum(debit - credit), 0), max(club_member_id::text)::uuid, min(created_at), min(description)
    INTO v_booked, v_member, v_at, v_orig
    FROM public.club_journal_entries
   WHERE journal_ref = _journal_ref AND club_id = _club_id AND account = 'gateway_fees'::public.gl_account;
  v_diff := round(_actual_fee - v_booked, 2);
  IF abs(v_diff) < 0.01 THEN RETURN 0; END IF;
  v_at := COALESCE(_at, v_at, now());
  v_label := 'Gateway fee adjusted to actual R' || trim(to_char(_actual_fee, 'FM999990.00'))
             || ' (was R' || trim(to_char(v_booked, 'FM999990.00')) || ')'
             || COALESCE(' — ' || COALESCE(_desc, split_part(v_orig, ' — gateway fee', 1)), '');
  IF v_diff > 0 THEN
    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at)
    VALUES (_club_id, v_ref, 'gateway_fees'::public.gl_account, v_diff, 0, v_label, v_member, v_at),
           (_club_id, v_ref, 'bank_current'::public.gl_account, 0, v_diff, v_label, v_member, v_at);
  ELSE
    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at)
    VALUES (_club_id, v_ref, 'bank_current'::public.gl_account, -v_diff, 0, v_label, v_member, v_at),
           (_club_id, v_ref, 'gateway_fees'::public.gl_account, 0, -v_diff, v_label, v_member, v_at);
  END IF;
  RETURN v_diff;
END $$;
REVOKE ALL ON FUNCTION public.post_gateway_fee_correction(uuid, uuid, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_gateway_fee_correction(uuid, uuid, numeric, text, timestamptz) TO service_role;

-- PayFast notifications report the exact fee (amount_fee). Payment sessions are
-- referenced by their id; bar tab payments by their shared PF-… reference.
CREATE OR REPLACE FUNCTION public.apply_payfast_actual_fee(_club_id uuid, _reference text, _fee numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ref uuid;
BEGIN
  IF _club_id IS NULL OR COALESCE(_reference,'') = '' OR _fee IS NULL OR _fee < 0 THEN RETURN 0; END IF;
  IF _reference LIKE 'PF-%' THEN
    v_ref := md5(_club_id::text || ':' || _reference)::uuid;
  ELSIF _reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_ref FROM public.payfast_payment_sessions WHERE id = _reference::uuid AND club_id = _club_id AND status = 'completed';
  END IF;
  IF v_ref IS NULL THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = v_ref AND account = 'gateway_fees'::public.gl_account) THEN RETURN 0; END IF;
  RETURN public.post_gateway_fee_correction(_club_id, v_ref, _fee, NULL, NULL);
END $$;
REVOKE ALL ON FUNCTION public.apply_payfast_actual_fee(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payfast_actual_fee(uuid, text, numeric) TO service_role;