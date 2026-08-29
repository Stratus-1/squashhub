CREATE OR REPLACE FUNCTION public.seed_ranking_points_from_ladder(_club_id uuid, _top_score numeric DEFAULT 1000, _step numeric DEFAULT 10, _unranked_default numeric DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rows_updated integer := 0;
  r RECORD;
  new_balance numeric;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.club_members SET ranking_points = 0
   WHERE club_id = _club_id AND NOT public.is_rankable_member(id)
     AND COALESCE(ranking_points,0) <> 0;

  FOR r IN
    SELECT id, ladder_position FROM public.club_members
     WHERE club_id = _club_id AND public.is_rankable_member(id)
  LOOP
    new_balance := GREATEST(0, _top_score - (r.ladder_position - 1) * _step);

    UPDATE public.club_members SET ranking_points = new_balance WHERE id = r.id;

    INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, created_by)
    VALUES (_club_id, r.id, new_balance, new_balance, 'Initial seed from ladder position', 'seed', auth.uid());

    rows_updated := rows_updated + 1;
  END LOOP;

  RETURN rows_updated;
END;
$function$;