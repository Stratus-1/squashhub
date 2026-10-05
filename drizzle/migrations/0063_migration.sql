CREATE OR REPLACE FUNCTION public.md_hdr_member_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(DISTINCT id), '{}') FROM (
    SELECT club_member_id AS id FROM member_league_registrations
     WHERE club_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
    UNION
    SELECT player_one_member_id FROM league_team_pairs
     WHERE player_one_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
    UNION
    SELECT player_two_member_id FROM league_team_pairs
     WHERE player_two_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
  ) s
$function$;