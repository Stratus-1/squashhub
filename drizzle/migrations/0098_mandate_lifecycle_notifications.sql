CREATE TABLE public.mandate_lifecycle_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  event text NOT NULL,
  mandate_status text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mandate_id, event)
);
GRANT SELECT ON public.mandate_lifecycle_notifications TO authenticated;
GRANT ALL ON public.mandate_lifecycle_notifications TO service_role;
ALTER TABLE public.mandate_lifecycle_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff read mandate notification audit"
  ON public.mandate_lifecycle_notifications FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));

-- Recipients: club members explicitly granted 'finance' or 'recurring_payments' (custom or via role).
-- General club admins / full-admin flags are deliberately NOT included by default.
CREATE OR REPLACE FUNCTION public.mandate_notification_recipients(_club_id uuid)
RETURNS TABLE(user_id uuid, club_member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.id
  FROM club_members cm
  JOIN club_member_permissions cmp ON cmp.club_member_id = cm.id
  LEFT JOIN club_permission_roles cpr ON cpr.id = cmp.permission_role_id AND cpr.club_id = _club_id
  WHERE cm.club_id = _club_id
    AND cm.user_id IS NOT NULL
    AND cm.status::text = 'active'
    AND (
      cmp.custom_permissions && ARRAY['finance','recurring_payments']
      OR cpr.permissions && ARRAY['finance','recurring_payments']
    )
  ORDER BY cm.user_id, cm.id
$$;
REVOKE ALL ON FUNCTION public.mandate_notification_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mandate_notification_recipients(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_mandate_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text; v_title text; v_msg text; v_name text; v_audit uuid; v_n int := 0;
  v_amt text; v_url text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN v_event := 'awaiting_authorisation';
    ELSIF NEW.status = 'active' THEN v_event := 'activated';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' THEN v_event := 'activated';
    ELSIF NEW.status IN ('failed','rejected','cancelled','expired') THEN v_event := NEW.status;
    END IF;
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO mandate_lifecycle_notifications (club_id, mandate_id, event, mandate_status)
    VALUES (NEW.club_id, NEW.id, v_event, NEW.status)
    ON CONFLICT (mandate_id, event) DO NOTHING
    RETURNING id INTO v_audit;
    IF v_audit IS NULL THEN RETURN NEW; END IF; -- already notified once

    SELECT name INTO v_name FROM club_members WHERE id = NEW.club_member_id;
    v_name := coalesce(nullif(v_name,''), 'A member');
    v_amt := 'max R' || to_char(coalesce(NEW.max_amount_cents,0)/100.0, 'FM999G999G990D00');
    v_url := '/club-admin?tab=finance&view=debit-orders&mandate=' || NEW.id;

    IF v_event = 'awaiting_authorisation' THEN
      v_title := 'New recurring card mandate awaiting authorisation';
      v_msg := v_name || ' set up a monthly card mandate (' || v_amt || ', collection day ' || coalesce(NEW.debit_day::text,'—')
        || '). Status: pending provider authorisation. Not active yet and no payment has been collected. Use Check status or Send via club WhatsApp.';
    ELSIF v_event = 'activated' THEN
      v_title := 'Recurring card mandate active';
      v_msg := v_name || '''s mandate (' || v_amt || ', day ' || coalesce(NEW.debit_day::text,'—') || ') is active since '
        || to_char(coalesce(NEW.authorised_at, now()) AT TIME ZONE 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI')
        || '. This confirms the mandate only — it is not a payment received.';
    ELSE
      v_title := 'Recurring card mandate ' || v_event;
      v_msg := v_name || '''s mandate (' || v_amt || ') is now ' || v_event
        || coalesce(' — ' || nullif(NEW.last_failure_reason,''), '')
        || '. This is a mandate status change, not a payment collection result.';
    END IF;

    INSERT INTO notifications (user_id, club_member_id, title, message, type, url, data)
    SELECT r.user_id, r.club_member_id, v_title, v_msg, 'finance_mandate', v_url,
           jsonb_build_object('club_id', NEW.club_id, 'mandate_id', NEW.id, 'event', v_event, 'status', NEW.status)
    FROM mandate_notification_recipients(NEW.club_id) r;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE mandate_lifecycle_notifications SET recipient_count = v_n WHERE id = v_audit;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notify_mandate_lifecycle failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_mandate_lifecycle() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_mandate_lifecycle
AFTER INSERT OR UPDATE OF status ON public.stitch_mandates
FOR EACH ROW EXECUTE FUNCTION public.notify_mandate_lifecycle();