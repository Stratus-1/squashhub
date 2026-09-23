DROP TRIGGER IF EXISTS trg_queue_champ_result_emails ON public.club_champs_matches;
CREATE TRIGGER trg_queue_champ_result_emails
  AFTER INSERT OR UPDATE OF status, winner_member_id, score ON public.club_champs_matches
  FOR EACH ROW
  WHEN (COALESCE(NEW.score, '') NOT ILIKE '%w/o%' AND COALESCE(NEW.score, '') NOT ILIKE '%walkover%')
  EXECUTE FUNCTION public.queue_champ_result_emails();

UPDATE public.club_champs_matches
   SET status = 'scheduled', winner_member_id = NULL, score = NULL, game_scores = NULL,
       side_a_points = NULL, side_b_points = NULL
 WHERE champ_id = '606bac95-fabe-4f49-936b-fed681a23f68'
   AND status = 'completed'
   AND score ILIKE '%(w/o)%';