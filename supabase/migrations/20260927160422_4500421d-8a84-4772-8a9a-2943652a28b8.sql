REVOKE ALL ON FUNCTION public.bar_costing_enabled(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bar_set_average_cost(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bar_cost_of_sales(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_set_average_cost(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_cost_of_sales(uuid, timestamptz, timestamptz) TO authenticated;