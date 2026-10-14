CREATE OR REPLACE FUNCTION public.release_expired_champ_holds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; now_local timestamp := (now() AT TIME ZONE 'Africa/Johannesburg');
BEGIN
  UPDATE bookings b SET status = 'cancelled',
    ops_note = coalesce(b.ops_note || ' | ', '') || 'Auto-released (unbooked Club Champs slot) at ' || to_char(now_local, 'YYYY-MM-DD HH24:MI')
  FROM courts c
  WHERE c.id = b.court_id
    AND c.club_id = 'd8397b8a-60d3-4c4b-afee-25dab218bf19'
    AND b.status <> 'cancelled'
    AND b.external_booker_name ILIKE 'club championship%'
    AND coalesce(b.external_id, '') NOT LIKE 'champ:%'
    AND now_local >= CASE WHEN extract(dow FROM b.date) = 6
                          THEN (b.date - 1) + time '17:00'
                          ELSE b.date + time '12:00' END;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.release_expired_champ_holds() FROM PUBLIC, anon, authenticated;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('release-champ-holds-noon','release-champ-holds-fri');
SELECT cron.schedule('release-champ-holds-noon', '0 10 * * *', 'SELECT public.release_expired_champ_holds()');
SELECT cron.schedule('release-champ-holds-fri', '0 15 * * 5', 'SELECT public.release_expired_champ_holds()');