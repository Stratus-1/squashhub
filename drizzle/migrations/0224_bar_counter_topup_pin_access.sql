-- PIN-only counters use the anon API role; the existing SECURITY DEFINER
-- function validates bar_counter_context(_token, NULL) before any financial write.
-- Keep card-only validation and all club/member checks unchanged.
GRANT EXECUTE ON FUNCTION public.bar_counter_topup_member(uuid, numeric, text, uuid, uuid) TO anon;