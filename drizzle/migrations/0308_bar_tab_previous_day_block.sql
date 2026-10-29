CREATE TABLE public.bar_tab_day_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.bar_guest_tabs(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  granted_by_user uuid NOT NULL,
  granted_by_member uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tab_id, override_date)
);
GRANT SELECT ON public.bar_tab_day_overrides TO authenticated;
GRANT ALL ON public.bar_tab_day_overrides TO service_role;
ALTER TABLE public.bar_tab_day_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members read tab overrides" ON public.bar_tab_day_overrides
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id = bar_tab_day_overrides.club_id AND cm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public._bar_local_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date $$;

CREATE OR REPLACE FUNCTION public._bar_tab_is_overdue(_tab_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM bar_guest_tabs t
     WHERE t.id = _tab_id AND t.status = 'open'
       AND (t.opened_at AT TIME ZONE 'Africa/Johannesburg')::date < _bar_local_today()
       AND NOT EXISTS (SELECT 1 FROM bar_tab_day_overrides o WHERE o.tab_id = t.id AND o.override_date = _bar_local_today())
  )
$$;

-- Block new items on a tab left open from a previous day.
CREATE OR REPLACE FUNCTION public.bar_guard_overdue_tab_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.guest_tab_id IS NULL OR COALESCE(NEW.total, 0) <= 0 OR NEW.payment_status <> 'on_tab' THEN
    RETURN NEW;
  END IF;
  IF _bar_tab_is_overdue(NEW.guest_tab_id) THEN
    RAISE EXCEPTION 'TAB_OVERDUE|This tab is still open from a previous day. Pay it or put it on the member account before adding more. Only the treasurer can allow an exception.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_bar_guard_overdue_tab_sale BEFORE INSERT ON public.bar_visitor_sales
  FOR EACH ROW EXECUTE FUNCTION public.bar_guard_overdue_tab_sale();

-- Block opening a fresh tab while the same person has an unpaid tab from a previous day.
CREATE OR REPLACE FUNCTION public.bar_guard_new_tab_with_overdue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bar_guest_tabs t
     WHERE t.club_id = NEW.club_id AND t.status = 'open'
       AND ((NEW.club_member_id IS NOT NULL AND t.club_member_id = NEW.club_member_id)
            OR lower(btrim(t.guest_name)) = lower(btrim(COALESCE(NEW.guest_name, ''))))
       AND _bar_tab_is_overdue(t.id)
  ) THEN
    RAISE EXCEPTION 'TAB_OVERDUE|% still has an unpaid tab from a previous day. Settle it (pay or put on member account) before opening a new one.', COALESCE(NEW.guest_name, 'This person')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_bar_guard_new_tab_with_overdue BEFORE INSERT ON public.bar_guest_tabs
  FOR EACH ROW EXECUTE FUNCTION public.bar_guard_new_tab_with_overdue();

-- Treasurer-only exception for today.
CREATE OR REPLACE FUNCTION public.bar_treasurer_allow_tab_today(_tab_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_member uuid;
BEGIN
  SELECT club_id INTO v_club FROM bar_guest_tabs WHERE id = _tab_id AND status = 'open';
  IF v_club IS NULL THEN RAISE EXCEPTION 'Open tab not found'; END IF;
  SELECT o.club_member_id INTO v_member FROM club_offices o
    JOIN club_members cm ON cm.id = o.club_member_id
   WHERE o.club_id = v_club AND o.office = 'treasurer' AND o.ended_at IS NULL AND cm.user_id = auth.uid()
   LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Only the club treasurer can allow this tab to continue'; END IF;
  INSERT INTO bar_tab_day_overrides (club_id, tab_id, override_date, granted_by_user, granted_by_member, reason)
  VALUES (v_club, _tab_id, _bar_local_today(), auth.uid(), v_member, NULLIF(btrim(COALESCE(_reason,'')), ''))
  ON CONFLICT (tab_id, override_date) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.bar_treasurer_allow_tab_today(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_treasurer_allow_tab_today(uuid, text) TO authenticated;