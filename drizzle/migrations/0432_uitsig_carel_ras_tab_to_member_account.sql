DO $$
DECLARE
  v_club uuid := 'd8397b8a-60d3-4c4b-afee-25dab218bf19';
  v_tab_id uuid := 'a4032f3f-2555-4d67-946c-4cdbec16d860';
  v_member uuid := 'b498e8fa-8cba-441f-9da5-b89de614c34f';
  v_cashup uuid := '27ed168a-e340-46ed-9fb2-f21832254b59';
  v_ref uuid := md5('tab-to-member-account:a4032f3f-2555-4d67-946c-4cdbec16d860')::uuid;
  v_tab public.bar_guest_tabs%ROWTYPE;
  v_cu public.bar_cash_ups%ROWTYPE;
  v_cu_after public.bar_cash_ups%ROWTYPE;
  v_total numeric; v_fee numeric;
  v_reason text := 'Tab closed as card machine at 20:45 on 17 Nov but never swiped on Yoco; moved to member account (approved by Willem Pretorius, 18 Nov 2026)';
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = v_tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND OR v_tab.status <> 'settled' OR v_tab.settled_method IS DISTINCT FROM 'terminal'
     OR v_tab.club_member_id IS DISTINCT FROM v_member
     OR EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = v_ref) THEN
    RAISE NOTICE 'Carel Ras tab correction skipped (already done or state changed)';
    RETURN;
  END IF;

  SELECT sum(total) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = v_tab_id AND payment_status = 'paid';
  IF v_total IS DISTINCT FROM 311 THEN RAISE EXCEPTION 'Unexpected tab total %', v_total; END IF;

  SELECT coalesce(sum(debit),0) INTO v_fee FROM public.club_journal_entries
   WHERE club_id = v_club AND account = 'gateway_fees'
     AND journal_ref IN ('761b3b47-5d94-a5d3-f5bd-fd7153d41570','69f54e8d-7d59-83b7-e5ae-6c2396c1b367',
                         '53f7fc0f-f68d-fb5f-df10-c0e835d22645','b081cff3-ee11-61e0-ca5c-9ee70b592441',
                         '41380edd-f55d-ef68-7388-af5e0ca512cf');
  IF v_fee IS DISTINCT FROM 8.21 THEN RAISE EXCEPTION 'Unexpected card fee %', v_fee; END IF;

  -- Member owes each item (same wording as normal account bar sales)
  INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at)
  SELECT v_club, v_ref, 'debtors', s.total, 0,
         'Bar sale: ' || s.quantity || '× ' || coalesce(b.name, 'item') || ' — Carel Ras (17 Nov tab moved to account)',
         v_member, s.created_at
    FROM public.bar_visitor_sales s LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
   WHERE s.guest_tab_id = v_tab_id AND s.payment_status = 'paid';

  INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
    (v_club, v_ref, 'bank_current', 0, 311, 'Carel Ras 17 Nov bar tab: not swiped on card machine — moved to member account'),
    (v_club, v_ref, 'bank_current', v_fee, 0, 'Carel Ras 17 Nov bar tab: card-machine fee reversed (not swiped)'),
    (v_club, v_ref, 'gateway_fees', 0, v_fee, 'Carel Ras 17 Nov bar tab: card-machine fee reversed (not swiped)');

  UPDATE public.bar_visitor_sales
     SET payment_method = 'tab',
         note = coalesce(note || ' · ', '') || 'moved to member account 18 Nov (not swiped)'
   WHERE guest_tab_id = v_tab_id AND payment_status = 'paid';

  UPDATE public.bar_guest_tabs SET settled_method = 'member_account' WHERE id = v_tab_id;

  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, reason)
  VALUES (v_club, v_tab_id, 'corrected', 'member_account', 311, v_reason);

  INSERT INTO public.audit_events (club_id, actor_label, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (v_club, 'Lovable (approved by Willem Pretorius)', 'bar_guest_tab', v_tab_id, 'admin_payment_method_correction', v_reason,
          jsonb_build_object('settled_method', 'terminal', 'amount', 311),
          jsonb_build_object('settled_method', 'member_account', 'amount', 311, 'journal_ref', v_ref));

  -- Saved cash-up: move R311 from card to member account; counted figures stay as entered
  SELECT * INTO v_cu FROM public.bar_cash_ups WHERE id = v_cashup AND club_id = v_club FOR UPDATE;
  IF FOUND AND v_tab.payment_confirmed_at > v_cu.period_start AND v_tab.payment_confirmed_at <= v_cu.period_end THEN
    UPDATE public.bar_cash_ups SET
      totals = jsonb_set(jsonb_set(jsonb_set(jsonb_set(totals,
        '{methods,card_bar,sales}', to_jsonb((totals#>>'{methods,card_bar,sales}')::numeric - 311)),
        '{methods,card_bar,count}', to_jsonb((totals#>>'{methods,card_bar,count}')::int - 1)),
        '{methods,member_account,sales}', to_jsonb((totals#>>'{methods,member_account,sales}')::numeric + 311)),
        '{methods,member_account,count}', to_jsonb((totals#>>'{methods,member_account,count}')::int + 1)),
      card_expected = card_expected - 311
    WHERE id = v_cashup
    RETURNING * INTO v_cu_after;
    INSERT INTO public.audit_events (club_id, actor_label, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (v_club, 'Lovable (approved by Willem Pretorius)', 'bar_cash_up', v_cashup, 'admin_correction', v_reason,
            to_jsonb(v_cu), to_jsonb(v_cu_after));
  END IF;
END $$;

-- Items on a guest tab later moved to a member account count as account purchases
CREATE OR REPLACE FUNCTION public.my_bar_purchases(_club_id uuid, _club_member_id uuid, p_sync_secret text DEFAULT NULL::text)
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
                              WHEN g.settled_method = 'member_account' AND s.payment_status = 'paid' THEN 'account'
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