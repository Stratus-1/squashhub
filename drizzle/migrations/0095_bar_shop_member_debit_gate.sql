ALTER TABLE public.club_bar_settings
  ADD COLUMN IF NOT EXISTS bar_allow_member_debit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shop_allow_member_debit boolean NOT NULL DEFAULT true;

-- Same rule as court bookings (src/lib/booking-balance-gate.ts computeBookingGate), buffer 0.
CREATE OR REPLACE FUNCTION public.member_account_gate(_club_member_id uuid, _extra numeric DEFAULT 0)
RETURNS TABLE(current_owing numeric, allowance numeric, projected_owing numeric, shortfall numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owing numeric; v_allow numeric := 0; v_mandate boolean;
BEGIN
  SELECT COALESCE(SUM(COALESCE(debit,0) - COALESCE(credit,0)),0) INTO v_owing
    FROM club_journal_entries WHERE club_member_id = _club_member_id AND account IN ('debtors','member_credits');
  SELECT EXISTS (SELECT 1 FROM stitch_mandates WHERE club_member_id = _club_member_id
     AND status = 'active' AND frequency = 'monthly' AND suspended_at IS NULL) INTO v_mandate;
  IF v_mandate THEN
    SELECT COALESCE(SUM(amount),0) INTO v_allow FROM club_member_fee_payments
     WHERE paid = false AND (club_member_id = _club_member_id OR paid_by_member_id = _club_member_id);
  END IF;
  current_owing := round(v_owing, 2);
  allowance := round(v_allow, 2);
  projected_owing := round(v_owing + COALESCE(_extra,0), 2);
  shortfall := round(GREATEST(v_owing + COALESCE(_extra,0) - v_allow, 0), 2);
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.member_account_gate(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_account_gate(uuid, numeric) TO authenticated;

-- Runs after row triggers have posted journals/stock; raising rolls everything back.
CREATE OR REPLACE FUNCTION public.bar_tab_enforce_member_debit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; g record;
BEGIN
  FOR r IN
    SELECT n.club_member_id, n.club_id, SUM(n.total) AS added,
           bool_or(CASE WHEN COALESCE(i.division,'bar') = 'shop'
                        THEN NOT COALESCE(s.shop_allow_member_debit, true)
                        ELSE NOT COALESCE(s.bar_allow_member_debit, true) END) AS gated
      FROM new_rows n
      LEFT JOIN bar_items i ON i.id = n.bar_item_id
      LEFT JOIN club_bar_settings s ON s.club_id = n.club_id
     WHERE n.settled IS NOT TRUE
     GROUP BY n.club_member_id, n.club_id
  LOOP
    CONTINUE WHEN NOT r.gated;
    PERFORM 1 FROM club_members WHERE id = r.club_member_id FOR UPDATE;
    SELECT * INTO g FROM member_account_gate(r.club_member_id, 0);
    IF g.shortfall > 0 THEN
      RAISE EXCEPTION 'ACCOUNT_LIMIT|%|%|%', g.shortfall, g.projected_owing, g.allowance
        USING ERRCODE = 'P0001',
              HINT = 'Pay by card or top up the member account first.';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS z_bar_tab_enforce_member_debit ON public.bar_tab_entries;
CREATE TRIGGER z_bar_tab_enforce_member_debit
  AFTER INSERT ON public.bar_tab_entries
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.bar_tab_enforce_member_debit();

CREATE OR REPLACE FUNCTION public.club_bar_settings_audit_debit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.bar_allow_member_debit AND NEW.shop_allow_member_debit THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.bar_allow_member_debit IS NOT DISTINCT FROM OLD.bar_allow_member_debit
     AND NEW.shop_allow_member_debit IS NOT DISTINCT FROM OLD.shop_allow_member_debit THEN RETURN NEW; END IF;
  INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (NEW.club_id, auth.uid(), 'club_bar_settings', NEW.club_id, 'member_debit_settings_changed',
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('bar', OLD.bar_allow_member_debit, 'shop', OLD.shop_allow_member_debit) END,
    jsonb_build_object('bar', NEW.bar_allow_member_debit, 'shop', NEW.shop_allow_member_debit));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS club_bar_settings_audit_debit_trg ON public.club_bar_settings;
CREATE TRIGGER club_bar_settings_audit_debit_trg AFTER INSERT OR UPDATE ON public.club_bar_settings
  FOR EACH ROW EXECUTE FUNCTION public.club_bar_settings_audit_debit();