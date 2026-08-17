-- Remove ambiguous older overloads (the 4-arg call matched both, raising an error inside the trigger)
DROP FUNCTION IF EXISTS public.post_gateway_fee(uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.club_gateway_fee_percent(uuid);

-- Backfill gateway fees for paid/recorded card visitor sales that have sale entries but no fee entries
DO $$
DECLARE r record; v_item text; v_desc text;
BEGIN
  FOR r IN
    SELECT s.* FROM public.bar_visitor_sales s
    WHERE s.payment_method = 'card'
      AND s.payment_status IN ('paid','recorded')
      AND EXISTS (SELECT 1 FROM public.club_journal_entries j WHERE j.journal_ref = s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_journal_entries j
        WHERE j.journal_ref = s.id AND j.account = 'gateway_fees'::public.gl_account)
  LOOP
    SELECT name INTO v_item FROM public.bar_items WHERE id = r.bar_item_id;
    v_desc := 'Bar visitor sale (card): ' || r.quantity::text || '× ' || COALESCE(v_item,'item')
              || COALESCE(' — ' || r.visitor_name, '');
    PERFORM public.post_gateway_fee(r.club_id, r.id, r.total, v_desc);
  END LOOP;
END $$;