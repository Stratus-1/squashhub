-- Finer club permissions: whole-area slugs keep meaning the whole area (nobody loses access);
-- dotted parts ("finance.enter") grant only that part; any part grants "<area>.view".

CREATE OR REPLACE FUNCTION public.perm_slug_granted(_held text[], _slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _slug = ANY(COALESCE(_held,'{}'))
    OR (strpos(_slug,'.') > 0 AND split_part(_slug,'.',1) = ANY(COALESCE(_held,'{}')))
    OR (_slug LIKE '%.view' AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(_held,'{}')) h
          WHERE left(h, length(split_part(_slug,'.',1)) + 1) = split_part(_slug,'.',1) || '.'));
$$;
GRANT EXECUTE ON FUNCTION public.perm_slug_granted(text[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_club_permission(_user_id uuid, _club_id uuid, _slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_club_chairman(_user_id,_club_id) OR EXISTS (
    SELECT 1 FROM public.club_member_permissions cmp
    JOIN public.club_members cm ON cm.id = cmp.club_member_id
    LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id
    WHERE cm.user_id = _user_id AND cm.club_id = _club_id
      AND (cmp.is_full_admin OR COALESCE(r.is_full_admin,false)
           OR public.perm_slug_granted(COALESCE(cmp.custom_permissions,'{}') || COALESCE(r.permissions,'{}'), _slug))
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_club_admin_or_permitted(_user_id uuid, _club_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_club_chairman(_user_id,_club_id) OR public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = _club_id AND cm.user_id = _user_id AND cm.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_members cm
      JOIN public.club_member_permissions cmp ON cmp.club_member_id = cm.id
      LEFT JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cm.club_id = _club_id AND cm.user_id = _user_id
        AND (cmp.is_full_admin = true
             OR public.perm_slug_granted(COALESCE(cmp.custom_permissions,'{}') || COALESCE(cpr.permissions,'{}'), _permission))
    );
$function$;

CREATE OR REPLACE FUNCTION public.member_has_permission(_member_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = _member_id AND cm.role IN ('captain', 'admin'))
    OR EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      LEFT JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cmp.club_member_id = _member_id
        AND public.perm_slug_granted(COALESCE(cmp.custom_permissions,'{}') || COALESCE(cpr.permissions,'{}'), _permission)
    )
$function$;

-- Finance writers limited to some parts. Mirrors is_club_finance_writer (no chairman shortcut:
-- chairman finance stays view-only).
CREATE OR REPLACE FUNCTION public.is_club_finance_part_writer(_user_id uuid, _club_id uuid, _parts text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_club_finance_writer(_user_id, _club_id) OR EXISTS (
    SELECT 1 FROM public.club_member_permissions cmp
    JOIN public.club_members cm ON cm.id = cmp.club_member_id
    LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id
    CROSS JOIN unnest(_parts) p
    WHERE cm.user_id = _user_id AND cm.club_id = _club_id
      AND NOT public.is_club_chairman(_user_id, _club_id)
      AND public.perm_slug_granted(COALESCE(cmp.custom_permissions,'{}') || COALESCE(r.permissions,'{}'), p)
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.is_club_finance_part_writer(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_finance_part_writer(uuid, uuid, text[]) TO authenticated, service_role;

-- AGM and voting: admins/office bearers as before, plus the "agm" permission.
CREATE OR REPLACE FUNCTION public.can_manage_agm(_user_id uuid, _club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'agm'));
$function$;
REVOKE EXECUTE ON FUNCTION public.can_manage_agm(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_agm(uuid, uuid) TO authenticated, service_role;

-- Bookings for others: admins as before, plus the "bookings_others" permission.
CREATE OR REPLACE FUNCTION public.can_manage_club_bookings(_user_id uuid, _club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'bookings_others'));
$function$;
REVOKE EXECUTE ON FUNCTION public.can_manage_club_bookings(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_club_bookings(uuid, uuid) TO authenticated, service_role;

-- Communications: area access for any part; a member given only some parts gets only those.
CREATE OR REPLACE FUNCTION public.can_manage_club_comms(_user_id uuid, _club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'communications.view')
    OR EXISTS (
      SELECT 1
      FROM public.clubs c
      JOIN public.club_members cm ON cm.club_id = c.id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE c.id = _club_id
        AND cm.id IN (c.chairman_member_id, c.vice_chairman_member_id, c.secretary_member_id,
                      c.treasurer_member_id, c.club_captain_member_id, c.club_manager_member_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_offices o
      JOIN public.club_members cm ON cm.id = o.club_member_id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE o.club_id = _club_id AND o.ended_at IS NULL
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_comms_part(_user_id uuid, _club_id uuid, _part text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.can_manage_club_comms(_user_id, _club_id) AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'communications.' || _part)
    OR NOT EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id
      CROSS JOIN unnest(COALESCE(cmp.custom_permissions,'{}') || COALESCE(r.permissions,'{}')) h
      WHERE cm.user_id = _user_id AND cm.club_id = _club_id AND h LIKE 'communications.%'));
$function$;
REVOKE EXECUTE ON FUNCTION public.can_comms_part(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_comms_part(uuid, uuid, text) TO authenticated, service_role;

-- Rules & Documents: existing managers plus the "documents" permission.
CREATE OR REPLACE FUNCTION public.can_manage_club_documents(_user_id uuid, _club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'club')
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'documents')
    OR EXISTS (
      SELECT 1 FROM public.clubs c
      JOIN public.club_members cm ON cm.club_id = c.id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE c.id = _club_id AND cm.id IN (c.chairman_member_id, c.secretary_member_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.club_offices o
      JOIN public.club_members cm ON cm.id = o.club_member_id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE o.club_id = _club_id AND o.ended_at IS NULL AND o.office IN ('chairman', 'secretary')
    )
  );
$function$;

-- Member changes by non-admin Members-permission holders: never the admin/captain role, and
-- suspending, resigning or reinstating needs the "Suspend or resign" part.
CREATE OR REPLACE FUNCTION public.club_members_guard_members_perm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_club_admin(auth.uid(), NEW.club_id)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND public.has_club_permission(auth.uid(), NEW.club_id, 'members.view')
     AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IN ('admin','captain') THEN NEW.role := 'member'; END IF;
    ELSE
      NEW.role := OLD.role;
      IF NEW.status IS DISTINCT FROM OLD.status
         AND (NEW.status::text IN ('suspended','resigned') OR OLD.status::text IN ('suspended','resigned'))
         AND NOT public.has_club_permission(auth.uid(), NEW.club_id, 'members.status') THEN
        RAISE EXCEPTION 'Suspending, resigning or reinstating members needs the "Suspend or resign members" permission' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Retarget existing permission checks to the finer parts. Done in place from the live
-- definitions so every other line of each function/policy stays exactly as it was.
CREATE OR REPLACE FUNCTION pg_temp.perm_retarget(_t text, _map jsonb) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE k text; v text;
BEGIN
  IF _t IS NULL THEN RETURN NULL; END IF;
  FOR k, v IN SELECT * FROM jsonb_each_text(_map) LOOP
    _t := regexp_replace(_t,
      '(is_club_admin_or_permitted|has_club_permission|member_has_permission)\(([^'';]{0,160})''' || k || '''',
      '\1(\2''' || v || '''', 'g');
  END LOOP;
  RETURN _t;
END $f$;

DO $do$
DECLARE
  fnmap jsonb := '{"admin_add_member_outstanding_balance": {"finance": "finance.billing"}, "admin_bill_member_fee": {"finance": "finance.billing"}, "admin_delete_journal_group": {"finance": "finance.reverse"}, "admin_reverse_journal_group": {"finance": "finance.reverse"}, "admin_post_member_correction": {"finance": "finance.enter"}, "cancel_arrears_plan": {"finance": "finance.billing"}, "decide_recurring_transaction": {"finance": "finance.approve"}, "finance_decide_member_transaction": {"finance": "finance.approve"}, "get_sla_prompt_state": {"finance": "finance.view"}, "import_league_fee_invoices": {"finance": "finance.billing"}, "income_statement_sale_costs": {"finance": "finance.view"}, "journal_read_club_ids": {"finance": "finance.view"}, "list_member_credit_transfers": {"finance": "finance.view"}, "member_credit_settings": {"finance": "finance.view"}, "member_outstanding_breakdown": {"finance": "finance.view"}, "member_transferable_credit": {"finance": "finance.view"}, "my_bar_purchases": {"finance": "finance.view"}, "set_journal_entry_date": {"finance": "finance.enter"}, "set_member_credit_allowed": {"finance": "finance.billing"}, "bar_confirm_payroll_run": {"finance": "finance.payroll"}, "bar_prepare_payroll_run_now": {"finance": "finance.payroll"}, "bar_set_staff_payday": {"finance": "finance.payroll"}, "bar_set_staff_salary": {"finance": "finance.payroll"}, "bar_staff_pay_overview": {"finance": "finance.payroll"}, "bar_admin_remove_zero_tab": {"finance": "finance.enter"}, "bar_admin_tab_to_member_account": {"finance": "finance.enter"}, "bar_cash_up_undo": {"bar": "bar.cashup", "finance": "finance.reverse"}, "bar_open_tabs": {"bar": "bar.view", "finance": "finance.view"}, "champ_admin_confirm_paid": {"champs": "champs.paid"}, "bar_account_charge_preview": {"bar": "bar.view"}, "bar_club_use": {"bar": "bar.stock"}, "bar_cost_of_sales": {"bar": "bar.view"}, "bar_set_average_cost": {"bar": "bar.stock"}, "bar_stock_levels_on": {"bar": "bar.view"}, "bar_stock_movement_report": {"bar": "bar.view"}, "bar_stock_take_start": {"bar": "bar.stocktake"}, "bar_stock_take_save": {"bar": "bar.stocktake"}, "bar_stock_take_finalise": {"bar": "bar.stocktake"}, "_family_request_email_officials": {"members": "members.approve"}, "notify_club_admins_of_application": {"members": "members.approve"}, "tournament_join_register": {"members": "members.approve"}, "family_add_member": {"members": "members.approve"}, "family_request_review_context": {"members": "members.approve"}, "family_review_addition": {"members": "members.approve"}, "guard_family_approval": {"members": "members.approve"}, "family_activate_approved": {"members": "members.approve"}, "review_membership_application": {"members": "members.approve"}, "admin_resolve_duplicate_member": {"members": "members.edit"}, "admin_set_member_standing": {"members": "members.status"}, "chairman_add_member": {"members": "members.edit"}, "chairman_ensure_joining_fee": {"members": "members.edit"}, "guard_chairman_financial_write": {"members": "members.edit"}, "is_club_member_manager": {"members": "members.edit"}, "ai_correct_champ_result": {"champs": "champs.results"}, "guard_champ_match_participant_scoring_update": {"champs": "champs.results"}, "can_use_tournament_beta": {"champs": "champs.view"}, "can_browse_invite_directory": {"champs": "champs.setup"}, "enforce_booking_credit_allowance": {"champs": "champs.setup"}, "club_champs_registrations_guard_self_insert": {"champs": "champs.setup"}, "club_champs_registrations_guard_self_update": {"champs": "champs.setup"}, "register_doubles_pair": {"champs": "champs.setup"}, "register_players_for_champ": {"champs": "champs.setup"}, "admin_replace_champ_player": {"champs": "champs.setup"}, "admin_set_round_play_by": {"champs": "champs.setup"}, "admin_set_round_timed": {"champs": "champs.setup"}, "ai_replace_tournament_player": {"champs": "champs.setup"}, "save_tournament_plan_version": {"champs": "champs.setup"}, "self_schedule_champ_match": {"champs": "champs.setup"}, "unschedule_champ_match": {"champs": "champs.setup"}, "can_manage_tournament": {"champs": "champs.setup"}}'::jsonb;
  r record; d text; nd text; n int := 0; changed text[] := '{}'; k text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND fnmap ? p.proname LOOP
    d := pg_get_functiondef(r.oid);
    nd := pg_temp.perm_retarget(d, fnmap -> r.proname);
    IF nd <> d THEN EXECUTE nd; changed := changed || r.proname::text; END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(fnmap) LOOP
    IF NOT k = ANY(changed) THEN RAISE EXCEPTION 'Permission retarget found nothing to change in %', k; END IF;
  END LOOP;

  -- Bar staff part may manage counter PINs.
  SELECT pg_get_functiondef('public.bar_can_manage_pins(uuid,uuid)'::regprocedure) INTO d;
  nd := replace(d, 'COALESCE(public.is_club_admin_or_permitted(_user_id, _club_id, ''finance''), false)',
    'COALESCE(public.is_club_admin_or_permitted(_user_id, _club_id, ''finance'') OR public.is_club_admin_or_permitted(_user_id, _club_id, ''bar.staff''), false)');
  IF nd = d THEN RAISE EXCEPTION 'bar_can_manage_pins not changed'; END IF;
  EXECUTE nd;

  -- Bookings for others may cancel other members' bookings like an admin.
  SELECT pg_get_functiondef('public.cancel_booking_checked(uuid,text)'::regprocedure) INTO d;
  nd := replace(d, 'v_admin := public.is_club_admin(auth.uid(), b.club_id);', 'v_admin := public.can_manage_club_bookings(auth.uid(), b.club_id);');
  IF nd = d THEN RAISE EXCEPTION 'cancel_booking_checked not changed'; END IF;
  EXECUTE nd;

  -- AGM and voting permission in every AGM admin function.
  n := 0;
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
             AND (p.proname LIKE 'agm\_%' OR p.proname LIKE '\_agm\_%') LOOP
    d := pg_get_functiondef(r.oid);
    nd := regexp_replace(d, '(public\.)?is_club_admin\(auth\.uid\(\)', 'public.can_manage_agm(auth.uid()', 'g');
    IF nd <> d THEN EXECUTE nd; n := n + 1; END IF;
  END LOOP;
  IF n < 10 THEN RAISE EXCEPTION 'Only % AGM functions updated', n; END IF;
END $do$;

DO $do$
DECLARE
  polmap jsonb := '{"bar_items|Bar managers can manage bar items": {"bar": "bar.prices"}, "bar_special_components|Bar managers manage special components": {"bar": "bar.prices"}, "club_bar_categories|Bar managers manage bar categories": {"bar": "bar.prices"}, "bar_stock_purchases|Bar managers can manage stock purchases": {"bar": "bar.stock"}, "bar_stock_takes|Bar staff manage stock takes": {"bar": "bar.stocktake"}, "bar_stock_take_lines|Bar staff manage stock take lines": {"bar": "bar.stocktake"}, "objects|Bar managers upload purchase invoices": {"bar": "bar.stock"}, "objects|Bar managers remove unlinked invoice uploads": {"bar": "bar.stock"}, "club_gl_accounts|Finance staff manage club GL accounts": {"finance": "finance.enter"}, "club_journal_attachments|Finance adds proofs": {"finance": "finance.enter"}, "objects|Finance uploads proof files": {"finance": "finance.enter"}, "club_recurring_settings|Club finance admins insert recurring settings": {"finance": "finance.billing"}, "club_recurring_settings|Club finance admins update recurring settings": {"finance": "finance.billing"}, "club_recurring_transactions|Finance manages recurring transactions": {"finance": "finance.approve"}, "club_members|Members-permission holders can insert members": {"members": "members.edit"}, "club_members|Members-permission holders can update members": {"members": "members.edit"}, "member_association_affiliations|Members-permission holders can insert affiliations": {"members": "members.edit"}, "member_association_affiliations|Members-permission holders can update affiliations": {"members": "members.edit"}, "member_association_affiliations|Members-permission holders can delete affiliations": {"members": "members.edit"}, "club_champs_matches|Participants captains and admins can score tournament matches": {"champs": "champs.results"}, "team_league_events|Tournament admins manage team leagues": {"champs": "champs.setup"}}'::jsonb;
  champs_tables text[] := ARRAY['club_champs_entries','club_champs_rounds','club_champs_registrations','tournaments','club_champs_matches'];
  sel jsonb := '{"finance":"finance.view","bar":"bar.view","members":"members.view","champs":"champs.view"}'::jsonb;
  r record; m jsonb; special boolean; nq text; nw text; rl text; stmt text; area text; n int := 0;
BEGIN
  FOR r IN SELECT * FROM pg_policies
           WHERE schemaname IN ('public','storage') AND policyname NOT LIKE 'NSC treasurer%'
             AND (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) ~
                 '(is_club_admin_or_permitted|has_club_permission|member_has_permission)\([^'';]{0,160}''(finance|bar|members|champs)''' LOOP
    m := NULL; special := false;
    IF r.cmd = 'SELECT' THEN m := sel;
    ELSIF polmap ? (r.tablename || '|' || r.policyname) THEN m := polmap -> (r.tablename || '|' || r.policyname);
    ELSIF r.tablename = ANY(champs_tables) AND r.policyname LIKE 'Tournament admins can update champs matches%' THEN special := true;
    ELSIF r.tablename = ANY(champs_tables) THEN m := '{"champs":"champs.setup"}'::jsonb;
    ELSE CONTINUE;
    END IF;
    IF special THEN
      nq := regexp_replace(r.qual, 'is_club_admin_or_permitted\(([^'';]{0,160}),\s*''champs''::text\)',
        '(is_club_admin_or_permitted(\1, ''champs.setup''::text) OR is_club_admin_or_permitted(\1, ''champs.results''::text))', 'g');
      nw := regexp_replace(r.with_check, 'is_club_admin_or_permitted\(([^'';]{0,160}),\s*''champs''::text\)',
        '(is_club_admin_or_permitted(\1, ''champs.setup''::text) OR is_club_admin_or_permitted(\1, ''champs.results''::text))', 'g');
    ELSE
      nq := pg_temp.perm_retarget(r.qual, m); nw := pg_temp.perm_retarget(r.with_check, m);
    END IF;
    IF nq IS NOT DISTINCT FROM r.qual AND nw IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;
    rl := array_to_string(ARRAY(SELECT CASE WHEN x = 'public' THEN 'public' ELSE quote_ident(x) END FROM unnest(r.roles) x), ', ');
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, rl);
    IF nq IS NOT NULL THEN stmt := stmt || ' USING (' || nq || ')'; END IF;
    IF nw IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || nw || ')'; END IF;
    EXECUTE stmt; n := n + 1;
    -- Anybody with any part of the area may still read rows a part-limited ALL policy covers.
    IF r.cmd = 'ALL' AND NOT special AND r.qual IS NOT NULL THEN
      SELECT key INTO area FROM jsonb_each_text(m) LIMIT 1;
      EXECUTE format('CREATE POLICY %I ON %I.%I AS PERMISSIVE FOR SELECT TO %s USING (%s)',
        left(r.policyname, 54) || ' (view)', r.schemaname, r.tablename, rl,
        pg_temp.perm_retarget(r.qual, jsonb_build_object(area, area || '.view')));
    END IF;
  END LOOP;
  IF n < 80 THEN RAISE EXCEPTION 'Only % policies retargeted', n; END IF;
END $do$;

-- Finance parts that post or tidy journals and bank lines.
CREATE POLICY "Finance parts insert club_journal_entries" ON public.club_journal_entries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.enter','finance.approve','finance.bank','finance.billing','finance.payroll']));
CREATE POLICY "Finance parts update club_journal_entries" ON public.club_journal_entries AS PERMISSIVE FOR UPDATE TO public
  USING (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.enter','finance.approve','finance.bank','finance.billing','finance.reverse']))
  WITH CHECK (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.enter','finance.approve','finance.bank','finance.billing','finance.reverse']));
CREATE POLICY "Finance reverse part deletes club_journal_entries" ON public.club_journal_entries AS PERMISSIVE FOR DELETE TO public
  USING (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.reverse']));
CREATE POLICY "Finance bank part manages club_bank_statements" ON public.club_bank_statements AS PERMISSIVE FOR ALL TO public
  USING (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']))
  WITH CHECK (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']));
CREATE POLICY "Finance bank part manages club_bank_transactions" ON public.club_bank_transactions AS PERMISSIVE FOR ALL TO public
  USING (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']))
  WITH CHECK (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']));
CREATE POLICY "Finance bank part manages club_bank_rules" ON public.club_bank_rules AS PERMISSIVE FOR ALL TO public
  USING (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']))
  WITH CHECK (public.is_club_finance_part_writer(auth.uid(), club_id, ARRAY['finance.bank']));
CREATE POLICY "Finance parts manage member fees" ON public.club_member_fee_payments AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id
                 AND public.is_club_finance_part_writer(auth.uid(), m.club_id, ARRAY['finance.approve','finance.billing'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id
                 AND public.is_club_finance_part_writer(auth.uid(), m.club_id, ARRAY['finance.approve','finance.billing'])));

-- Communications: templates need "Edit templates", campaigns need "Send messages".
DROP POLICY "Comms managers manage comms templates" ON public.comms_templates;
CREATE POLICY "Comms managers read comms templates" ON public.comms_templates AS PERMISSIVE FOR SELECT TO public
  USING (public.can_manage_club_comms(auth.uid(), club_id));
CREATE POLICY "Comms template editors manage comms templates" ON public.comms_templates AS PERMISSIVE FOR ALL TO public
  USING (public.can_comms_part(auth.uid(), club_id, 'templates'))
  WITH CHECK (public.can_comms_part(auth.uid(), club_id, 'templates'));
DROP POLICY "Comms managers manage comms template versions" ON public.comms_template_versions;
CREATE POLICY "Comms managers read comms template versions" ON public.comms_template_versions AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = comms_template_versions.template_id AND public.can_manage_club_comms(auth.uid(), t.club_id)));
CREATE POLICY "Comms template editors manage template versions" ON public.comms_template_versions AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = comms_template_versions.template_id AND public.can_comms_part(auth.uid(), t.club_id, 'templates')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = comms_template_versions.template_id AND public.can_comms_part(auth.uid(), t.club_id, 'templates')));
DROP POLICY "Comms managers manage comms campaigns" ON public.comms_campaigns;
CREATE POLICY "Comms managers read comms campaigns" ON public.comms_campaigns AS PERMISSIVE FOR SELECT TO public
  USING (public.can_manage_club_comms(auth.uid(), club_id));
CREATE POLICY "Comms senders manage comms campaigns" ON public.comms_campaigns AS PERMISSIVE FOR ALL TO public
  USING (public.can_comms_part(auth.uid(), club_id, 'send'))
  WITH CHECK (public.can_comms_part(auth.uid(), club_id, 'send'));

-- AGM ballots: "AGM and voting" permission alongside admins.
DROP POLICY "Admins create draft ballots" ON public.agm_ballots;
CREATE POLICY "Admins create draft ballots" ON public.agm_ballots AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (public.can_manage_agm(auth.uid(), club_id) AND status = 'draft');
DROP POLICY "Admins delete draft ballots" ON public.agm_ballots;
CREATE POLICY "Admins delete draft ballots" ON public.agm_ballots AS PERMISSIVE FOR DELETE TO public
  USING (public.can_manage_agm(auth.uid(), club_id) AND status = 'draft');
DROP POLICY "Admins edit draft ballots" ON public.agm_ballots;
CREATE POLICY "Admins edit draft ballots" ON public.agm_ballots AS PERMISSIVE FOR UPDATE TO public
  USING (public.can_manage_agm(auth.uid(), club_id) AND status = 'draft')
  WITH CHECK (public.can_manage_agm(auth.uid(), club_id) AND status = 'draft');
DROP POLICY "Admins read ballots" ON public.agm_ballots;
CREATE POLICY "Admins read ballots" ON public.agm_ballots AS PERMISSIVE FOR SELECT TO public
  USING (public.can_manage_agm(auth.uid(), club_id));

-- Bookings for others: may change or cancel any club booking, like an admin.
CREATE POLICY "Booking managers can update club bookings" ON public.bookings AS PERMISSIVE FOR UPDATE TO public
  USING (club_id IS NOT NULL AND public.is_club_admin_or_permitted(auth.uid(), club_id, 'bookings_others'))
  WITH CHECK (club_id IS NOT NULL AND public.is_club_admin_or_permitted(auth.uid(), club_id, 'bookings_others'));
