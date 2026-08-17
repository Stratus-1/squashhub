ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS gateway_fee_pct_card_local numeric,
  ADD COLUMN IF NOT EXISTS gateway_fee_pct_card_intl numeric,
  ADD COLUMN IF NOT EXISTS gateway_fee_pct_wallet numeric,
  ADD COLUMN IF NOT EXISTS gateway_fee_pct_capitec numeric;

CREATE OR REPLACE FUNCTION public.club_gateway_fee_percent(_club_id uuid, _method text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE lower(COALESCE(_method, ''))
      WHEN 'card_local' THEN c.gateway_fee_pct_card_local
      WHEN 'card_intl'  THEN c.gateway_fee_pct_card_intl
      WHEN 'wallet'     THEN c.gateway_fee_pct_wallet
      WHEN 'capitec'    THEN c.gateway_fee_pct_capitec
      ELSE NULL
    END,
    c.payment_gateway_fee_percent,
    c.gateway_fee_pct_card_local,
    CASE lower(COALESCE(c.payment_gateway, ''))
      WHEN 'yoco' THEN 2.9
      WHEN 'stitch' THEN 2.5
      ELSE 3.5
    END
  )
  FROM public.clubs c
  WHERE c.id = _club_id
$function$;

CREATE OR REPLACE FUNCTION public.post_gateway_fee(_club_id uuid, _journal_ref uuid, _amount numeric, _desc text, _club_member_id uuid DEFAULT NULL::uuid, _method text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pct numeric;
  v_fee numeric;
  v_ref uuid := COALESCE(_journal_ref, gen_random_uuid());
BEGIN
  IF _club_id IS NULL OR COALESCE(_amount, 0) <= 0 THEN RETURN 0; END IF;

  v_pct := public.club_gateway_fee_percent(_club_id, _method);
  IF COALESCE(v_pct, 0) <= 0 THEN RETURN 0; END IF;

  v_fee := round(_amount * v_pct / 100.0, 2);
  IF v_fee <= 0 THEN RETURN 0; END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.club_gateway_fee_percent(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_gateway_fee(uuid, uuid, numeric, text, uuid, text) FROM anon, authenticated;