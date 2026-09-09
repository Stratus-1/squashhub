
GRANT EXECUTE ON FUNCTION public.can_view_member_stats(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_member_match_history(uuid, integer, text, uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_member_stats_summary(uuid, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_member_stat_seasons(uuid) TO service_role, postgres;
