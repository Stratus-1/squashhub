ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS payment_gateway_fee_percent numeric;

CREATE OR REPLACE FUNCTION public.club_gateway_fee_percent(_club_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    c.payment_gateway_fee_percent,
    CASE lower(COALESCE(c.payment_gateway, ''))
      WHEN 'yoco' THEN 2.9
      WHEN 'stitch' THEN 2.5
      ELSE 3.5
    END
  )
  FROM public.clubs c
  WHERE c.id = _club_id
$$;

CREATE OR REPLACE FUNCTION public.post_gateway_fee(_club_id uuid, _journal_ref uuid, _amount numeric, _desc text, _club_member_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pct numeric;
  v_fee numeric;
  v_ref uuid := COALESCE(_journal_ref, gen_random_uuid());
BEGIN
  IF _club_id IS NULL OR COALESCE(_amount, 0) <= 0 THEN RETURN 0; END IF;

  v_pct := public.club_gateway_fee_percent(_club_id);
  IF COALESCE(v_pct, 0) <= 0 THEN RETURN 0; END IF;

  v_fee := round(_amount * v_pct / 100.0, 2);
  IF v_fee <= 0 THEN RETURN 0; END IF;

  -- Idempotency: never post the fee twice for the same reference
  IF EXISTS (
    SELECT 1 FROM public.club_journal_entries
    WHERE journal_ref = v_ref AND account = 'gateway_fees'::public.gl_account
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.club_journal_entries
    (club_id, journal_ref, account, debit, credit, description, club_member_id)
  VALUES
    (_club_id, v_ref, 'gateway_fees'::public.gl_account, v_fee, 0,
     COALESCE(_desc, 'Card payment') || ' — gateway fee (' || trim(to_char(v_pct, 'FM999990.00')) || '%)', _club_member_id),
    (_club_id, v_ref, 'bank_current'::public.gl_account, 0, v_fee,
     COALESCE(_desc, 'Card payment') || ' — gateway fee (' || trim(to_char(v_pct, 'FM999990.00')) || '%)', _club_member_id);

  RETURN v_fee;
END;
$$;

-- Bar visitor sales (insert path)
CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_name text;
  v_desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'pending' THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
    v_desc := 'Bar visitor sale (' || NEW.payment_method || '): ' || NEW.quantity::text
              || '× ' || COALESCE(v_item_name, 'item')
              || COALESCE(' — ' || NEW.visitor_name, '');

    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description)
    VALUES
      (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0, v_desc),
      (NEW.club_id, NEW.id, 'bar_income',   0, NEW.total, v_desc);

    IF NEW.payment_method = 'card' THEN
      PERFORM public.post_gateway_fee(NEW.club_id, NEW.id, NEW.total, v_desc);
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Bar visitor sales (status confirmation path)
CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_name text;
  v_desc text;
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IN ('paid', 'recorded') THEN
    IF NOT EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = NEW.id) THEN
      SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
      v_desc := 'Bar visitor sale (' || NEW.payment_method || '): ' || NEW.quantity::text
                || '× ' || COALESCE(v_item_name, 'item')
                || COALESCE(' — ' || NEW.visitor_name, '');

      INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description)
      VALUES
        (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0, v_desc),
        (NEW.club_id, NEW.id, 'bar_income',   0, NEW.total, v_desc);

      IF NEW.payment_method = 'card' THEN
        PERFORM public.post_gateway_fee(NEW.club_id, NEW.id, NEW.total, v_desc);
      END IF;
    END IF;
  ELSIF NEW.payment_status = 'failed' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Stitch recurring collections
CREATE OR REPLACE FUNCTION public.record_collection_payment(_collection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.stitch_collections%ROWTYPE;
  m public.stitch_mandates%ROWTYPE;
  v_when timestamptz;
  v_total numeric;
  v_remaining numeric;
  v_tx_id uuid;
  v_fee record;
  v_ref text;
  v_settled integer := 0;
BEGIN
  SELECT * INTO c FROM public.stitch_collections WHERE id = _collection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF c.posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT * INTO m FROM public.stitch_mandates WHERE id = c.mandate_id;

  v_ref := 'stitch-col:' || c.id::text;
  IF EXISTS (
    SELECT 1 FROM public.member_credit_transactions WHERE reference = v_ref
  ) THEN
    UPDATE public.stitch_collections SET posted_at = COALESCE(posted_at, now()) WHERE id = c.id;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_when := COALESCE(c.settled_at, now());
  v_total := COALESCE(c.amount_cents, 0)::numeric / 100.0;
  IF v_total <= 0 THEN
    UPDATE public.stitch_collections SET posted_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('ok', true, 'skipped', 'zero_amount');
  END IF;

  v_remaining := v_total;

  IF c.fee_payable_id IS NOT NULL THEN
    SELECT id, amount INTO v_fee
    FROM public.club_member_fee_payments
    WHERE id = c.fee_payable_id AND paid IS NOT TRUE;
    IF FOUND AND v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_when WHERE id = v_fee.id;
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    END IF;
  END IF;

  FOR v_fee IN
    SELECT id, amount
    FROM public.club_member_fee_payments
    WHERE club_member_id = c.club_member_id
      AND paid IS NOT TRUE
      AND COALESCE(amount, 0) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_when WHERE id = v_fee.id;
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.member_credit_transactions
      (user_id, club_id, club_member_id, amount, type, method, status,
       description, reference, created_at, confirmed_at)
    VALUES
      (COALESCE(m.user_id, NULL), c.club_id, c.club_member_id, v_remaining, 'debit', 'card', 'confirmed',
       'Recurring card payment [Stitch]', v_ref, v_when, v_when)
    RETURNING id INTO v_tx_id;

    UPDATE public.club_journal_entries SET created_at = v_when WHERE transaction_id = v_tx_id;
  END IF;

  -- Card transaction: book the payment gateway fee against the bank account
  PERFORM public.post_gateway_fee(c.club_id, c.id, v_total, 'Recurring card payment [Stitch]', c.club_member_id);

  UPDATE public.stitch_collections SET posted_at = now() WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'settled_fees', v_settled, 'credited', v_remaining, 'tx_id', v_tx_id);
END;
$function$;

-- Stitch mandate first charge
CREATE OR REPLACE FUNCTION public.record_mandate_initial_payment(_mandate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m public.stitch_mandates%ROWTYPE;
  v_when timestamptz;
  v_total numeric;
  v_remaining numeric;
  v_tx_id uuid;
  v_existing_tx uuid;
  v_fee record;
  v_settled integer := 0;
BEGIN
  SELECT * INTO m FROM public.stitch_mandates WHERE id = _mandate_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF m.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_active'); END IF;
  IF m.initial_payment_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT t.id INTO v_existing_tx
  FROM public.member_credit_transactions t
  JOIN public.stitch_collections c ON t.reference = 'stitch-col:' || c.id::text
  WHERE c.mandate_id = m.id
  ORDER BY t.created_at ASC
  LIMIT 1;
  IF v_existing_tx IS NOT NULL THEN
    UPDATE public.stitch_mandates
      SET initial_payment_tx_id = v_existing_tx
    WHERE id = m.id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'reason', 'collection_recorded');
  END IF;

  v_when := COALESCE(m.authorised_at, m.updated_at, now());

  v_total := COALESCE(
    m.initial_amount_cents,
    CASE WHEN m.mandate_type = 'subscription' THEN m.max_amount_cents ELSE 0 END
  )::numeric / 100.0;
  IF v_total <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no_initial_charge'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_credit_transactions
    WHERE club_member_id = m.club_member_id
      AND method = 'card'
      AND reference = COALESCE(m.stitch_mandate_id, m.id::text)
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_remaining := v_total;

  FOR v_fee IN
    SELECT id, amount
    FROM public.club_member_fee_payments
    WHERE club_member_id = m.club_member_id
      AND paid IS NOT TRUE
      AND COALESCE(amount, 0) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments
        SET paid = true, paid_at = v_when
      WHERE id = v_fee.id;
      UPDATE public.club_journal_entries
        SET created_at = v_when
      WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries
        SET created_at = v_when
      WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.member_credit_transactions
      (user_id, club_id, club_member_id, amount, type, method, status,
       description, reference, created_at, confirmed_at)
    VALUES
      (m.user_id, m.club_id, m.club_member_id, v_remaining, 'debit', 'card', 'confirmed',
       'Recurring payment setup - first charge [Stitch]',
       COALESCE(m.stitch_mandate_id, m.id::text), v_when, v_when)
    RETURNING id INTO v_tx_id;

    UPDATE public.club_journal_entries
      SET created_at = v_when
    WHERE transaction_id = v_tx_id;
  END IF;

  PERFORM public.post_gateway_fee(m.club_id, m.id, v_total, 'Recurring payment setup - first charge [Stitch]', m.club_member_id);

  UPDATE public.stitch_mandates
    SET initial_payment_tx_id = COALESCE(v_tx_id, m.id),
        initial_amount_cents = COALESCE(initial_amount_cents, (v_total * 100)::int)
  WHERE id = m.id;

  RETURN jsonb_build_object(
    'ok', true, 'amount', v_total, 'fees_settled', v_settled,
    'on_account', v_remaining, 'effective_date', v_when
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.club_gateway_fee_percent(uuid) TO authenticated, anon, service_role;