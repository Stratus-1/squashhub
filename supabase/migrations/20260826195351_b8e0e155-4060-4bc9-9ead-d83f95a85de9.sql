-- 1) Bring saved club rates up to VAT-inclusive
UPDATE public.clubs SET
  payment_gateway_fee_percent = round(payment_gateway_fee_percent * 1.15, 2)
WHERE payment_gateway_fee_percent IS NOT NULL;

UPDATE public.clubs SET
  gateway_fee_pct_card_local = round(gateway_fee_pct_card_local * 1.15, 2)
WHERE gateway_fee_pct_card_local IS NOT NULL;

UPDATE public.clubs SET
  gateway_fee_pct_card_intl = round(gateway_fee_pct_card_intl * 1.15, 2)
WHERE gateway_fee_pct_card_intl IS NOT NULL;

UPDATE public.clubs SET
  gateway_fee_pct_wallet = round(gateway_fee_pct_wallet * 1.15, 2)
WHERE gateway_fee_pct_wallet IS NOT NULL;

UPDATE public.clubs SET
  gateway_fee_pct_capitec = round(gateway_fee_pct_capitec * 1.15, 2)
WHERE gateway_fee_pct_capitec IS NOT NULL;

-- 2) Restate historical gateway fee journal entries to VAT-inclusive amounts
WITH src AS (
  SELECT id,
         debit, credit,
         (regexp_match(description, 'gateway fee \(([0-9]+\.?[0-9]*)%\)'))[1]::numeric AS old_pct
  FROM public.club_journal_entries
  WHERE account = 'gateway_fees'::public.gl_account
     OR (journal_ref IN (
           SELECT journal_ref FROM public.club_journal_entries
           WHERE account = 'gateway_fees'::public.gl_account
         ) AND description LIKE '%gateway fee (%')
)
UPDATE public.club_journal_entries j
SET debit = CASE WHEN j.debit > 0 THEN round(j.debit * 1.15, 2) ELSE j.debit END,
    credit = CASE WHEN j.credit > 0 THEN round(j.credit * 1.15, 2) ELSE j.credit END,
    description = regexp_replace(
      j.description,
      'gateway fee \([0-9]+\.?[0-9]*%\)',
      'gateway fee (' || trim(to_char(round(src.old_pct * 1.15, 2), 'FM999990.00')) || '% incl. VAT)'
    )
FROM src
WHERE src.id = j.id AND src.old_pct IS NOT NULL;

-- 3) VAT-inclusive default fallbacks + clearer description wording
CREATE OR REPLACE FUNCTION public.club_gateway_fee_percent(_club_id uuid, _method text DEFAULT NULL::text)
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
    -- VAT-inclusive defaults (list rates x 1.15)
    CASE lower(COALESCE(c.payment_gateway, ''))
      WHEN 'yoco' THEN 3.34
      WHEN 'stitch' THEN 3.39
      ELSE 4.03
    END
  )
  FROM public.clubs c
  WHERE c.id = _club_id
$function$;

CREATE OR REPLACE FUNCTION public.post_gateway_fee(_club_id uuid, _journal_ref uuid, _amount numeric, _desc text, _club_member_id uuid DEFAULT NULL::uuid, _method text DEFAULT NULL::text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pct numeric;
  v_fee numeric;
  v_label text;
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

  v_label := COALESCE(_desc, 'Card payment') || ' — gateway fee ('
             || trim(to_char(v_pct, 'FM999990.00')) || '% incl. VAT)';

  INSERT INTO public.club_journal_entries
    (club_id, journal_ref, account, debit, credit, description, club_member_id)
  VALUES
    (_club_id, v_ref, 'gateway_fees'::public.gl_account, v_fee, 0, v_label, _club_member_id),
    (_club_id, v_ref, 'bank_current'::public.gl_account, 0, v_fee, v_label, _club_member_id);

  RETURN v_fee;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.post_gateway_fee(uuid, uuid, numeric, text, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.club_gateway_fee_percent(uuid, text) FROM anon;