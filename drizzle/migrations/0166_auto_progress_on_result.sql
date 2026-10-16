INSERT INTO public.app_settings(key, value) VALUES ('auto_progress_private_secret', encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_auto_progress_on_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  IF NEW.winner_member_id IS NULL OR NEW.winner_member_id IS NOT DISTINCT FROM OLD.winner_member_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = NEW.champ_id AND t.builder_architecture = 'structured') THEN RETURN NEW; END IF;
  SELECT value INTO s FROM public.app_settings WHERE key = 'auto_progress_private_secret';
  IF s IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/auto-progress-tournaments',
      headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', s),
      body := jsonb_build_object('tid', NEW.champ_id));
  EXCEPTION WHEN OTHERS THEN NULL; -- never block saving a result
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_auto_progress_on_result() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auto_progress_on_result ON public.club_champs_matches;
CREATE TRIGGER auto_progress_on_result AFTER UPDATE OF winner_member_id ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_progress_on_result();