CREATE OR REPLACE FUNCTION public.get_member_stats_summary(_member_id uuid, _season_year integer DEFAULT NULL::integer)
 RETURNS TABLE(category text, played bigint, won bigint, lost bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH rows AS (
    SELECT * FROM public.get_member_match_history(_member_id, _season_year, NULL, NULL)
  )
  SELECT r.category,
         count(*)::bigint,
         count(*) FILTER (WHERE COALESCE(r.won, false))::bigint,
         count(*) FILTER (WHERE NOT COALESCE(r.won, false))::bigint
  FROM rows r
  GROUP BY r.category
  UNION ALL
  SELECT 'total',
         count(*)::bigint,
         count(*) FILTER (WHERE COALESCE(r.won, false))::bigint,
         count(*) FILTER (WHERE NOT COALESCE(r.won, false))::bigint
  FROM rows r;
$function$;

-- Imported rows have no member row for external opponents, so a null winner
-- means the member did not win that match.
UPDATE public.matches m
SET winner_member_id = NULL
WHERE FALSE;