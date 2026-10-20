DO $$ BEGIN
  PERFORM cron.unschedule('release-champ-holds-noon') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='release-champ-holds-noon');
  PERFORM cron.unschedule('release-champ-holds-fri') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='release-champ-holds-fri');
END $$;