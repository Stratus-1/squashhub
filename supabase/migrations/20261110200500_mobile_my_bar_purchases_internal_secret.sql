-- Let the authenticated GCP/Firebase Player API read the SAME bar purchase
-- history as the web app for a member it has already verified.
--
-- Backward compatible:
--   * Web callers keep calling my_bar_purchases(_club_id, _club_member_id);
--     the new third parameter defaults to NULL, so that call resolves to this
--     function and follows the unchanged auth.uid() owner/club-admin checks.
--   * Output shape and purchase logic are byte-for-byte the previous body.
--   * Execute grants match the previous function (anon, authenticated,
--     service_role).
-- Internal path: only when p_sync_secret is supplied. It must pass
-- public.mobile_internal_secret_ok(); the club/member pair must still match an
-- existing membership before any rows are returned. A supplied but invalid
-- secret never falls back to the web path.
--
-- A defaulted parameter changes the signature, so the old two-argument
-- function is replaced inside this single transaction (no parallel function).

DROP FUNCTION IF EXISTS public.my_bar_purchases(uuid, uuid);

CREATE FUNCTION public.my_bar_purchases(_club_id uuid, _club_member_id uuid, p_sync_secret text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m public.club_members%ROWTYPE;
BEGIN
  IF p_sync_secret IS NOT NULL THEN
    IF public.mobile_internal_secret_ok(p_sync_secret) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501';
    END IF;
    SELECT * INTO m FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Membership not found at this club' USING ERRCODE='42501'; END IF;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to view your purchases' USING ERRCODE='42501'; END IF;
    SELECT * INTO m FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Membership not found at this club' USING ERRCODE='42501'; END IF;
    IF m.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_club_admin(auth.uid(), _club_id) THEN
      RAISE EXCEPTION 'This membership is not yours' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY row->>'created_at' DESC) FROM (
      SELECT jsonb_build_object('id', e.id, 'created_at', e.created_at,
               'item_name', COALESCE(b.name, 'Item'), 'quantity', e.quantity, 'total', e.total,
               'method', 'account', 'payment_group', NULL) AS row
        FROM public.bar_tab_entries e LEFT JOIN public.bar_items b ON b.id = e.bar_item_id
       WHERE e.club_id = _club_id AND e.club_member_id = _club_member_id
      UNION ALL
      SELECT jsonb_build_object('id', s.id, 'created_at', s.created_at,
               'item_name', COALESCE(b.name, 'Item'), 'quantity', s.quantity, 'total', s.total,
               'method', CASE WHEN s.payment_status IN ('on_tab','pending') THEN 'unpaid'
                              WHEN s.payment_method IN ('cash','card','online','account') THEN s.payment_method
                              WHEN s.payment_method = 'terminal' THEN 'card'
                              ELSE COALESCE(s.payment_method, 'other') END,
               'payment_group', COALESCE(s.payment_reference, s.guest_tab_id::text, s.id::text)) AS row
        FROM public.bar_visitor_sales s
        LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
        LEFT JOIN public.bar_guest_tabs g ON g.id = s.guest_tab_id
       WHERE s.club_id = _club_id
         AND (s.payment_status IN ('paid','awaiting_cash','awaiting_terminal')
              OR (s.payment_status IN ('on_tab','pending') AND g.status IN ('open','closing')))
         AND (g.club_member_id = _club_member_id OR s.operator_member_id = _club_member_id OR s.logged_by = _club_member_id)
    ) u
  ), '[]'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.my_bar_purchases(uuid, uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
