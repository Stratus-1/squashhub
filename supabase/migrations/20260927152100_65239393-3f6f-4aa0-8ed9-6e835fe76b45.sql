REVOKE EXECUTE ON FUNCTION public.bar_special_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_items_sync_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_items_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_special_components_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_consume_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_stock_apply(uuid, integer, text, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_refresh_dependents(uuid) FROM PUBLIC, anon, authenticated;