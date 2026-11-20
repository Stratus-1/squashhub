CREATE FUNCTION pg_temp.fx_swap(d text, a text, b text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'expected fragment not found exactly once: %', left(a, 80);
  END IF;
  RETURN replace(d, a, b);
END $f$;

DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.respond_tournament_invite_public'::regproc);
  d := pg_temp.fx_swap(d, $x$    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (coalesce(public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id), v_reg.club_member_id), 'tournament_entry', v_label, v_amount, false,
            EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO v_fee_id;$x$,
    $x$    -- Charge what this player owes for the categories they pay for themselves
    -- (package price, less any partner cover), via the one idempotent fee writer.
    v_fee_id := public.ensure_tournament_entry_fee(v_reg.id);$x$);
  d := pg_temp.fx_swap(d, $x$  PERFORM public.apply_registration_division_choices(v_reg.id);
$x$,
    $x$  PERFORM public.apply_registration_division_choices(v_reg.id);
  -- Now confirmed: bring an existing unpaid fee in line with the categories and covers.
  PERFORM public.refresh_tournament_entry_fee(v_reg.id);
$x$);
  EXECUTE d;
END $mig$;
DROP FUNCTION pg_temp.fx_swap(text, text, text);