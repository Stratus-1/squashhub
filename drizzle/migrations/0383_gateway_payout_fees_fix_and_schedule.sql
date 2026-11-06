CREATE OR REPLACE FUNCTION public.post_gateway_payout_fees(_on date DEFAULT (now() AT TIME ZONE 'Africa/Johannesburg')::date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_ref uuid; v_desc text; v_n int := 0; v_day int := extract(day FROM _on);
  v_at timestamptz := (_on::timestamp + time '08:00') AT TIME ZONE 'Africa/Johannesburg';
BEGIN
  FOR r IN SELECT s.* FROM public.club_gateway_payout_settings s
           WHERE s.fee_per_payout > 0 AND (
             (s.payouts_per_month = 1 AND v_day = 1) OR
             (s.payouts_per_month = 2 AND v_day IN (1,15)) OR
             (s.payouts_per_month = 4 AND v_day IN (1,8,15,22))) LOOP
    v_ref := md5(r.club_id::text || ':payout:' || r.provider || ':' || _on::text)::uuid;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = v_ref);
    v_desc := initcap(r.provider) || ' payout fee — ' || to_char(_on, 'DD Mon YYYY');
    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, created_at)
    VALUES (r.club_id, v_ref, 'gateway_fees'::public.gl_account, r.fee_per_payout, 0, v_desc, v_at),
           (r.club_id, v_ref, 'bank_current'::public.gl_account, 0, r.fee_per_payout, v_desc, v_at);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.post_gateway_payout_fees(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_gateway_payout_fees(date) TO service_role;

SELECT cron.unschedule('gateway-payout-fees-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='gateway-payout-fees-daily');
SELECT cron.schedule('gateway-payout-fees-daily', '15 6 * * *', $c$SELECT public.post_gateway_payout_fees()$c$);