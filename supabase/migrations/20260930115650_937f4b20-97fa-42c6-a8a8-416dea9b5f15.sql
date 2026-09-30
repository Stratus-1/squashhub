CREATE OR REPLACE FUNCTION public.help_center_initial_sync()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  v_rev bigint;
  v_count integer := 0;
BEGIN
  FOR t IN
    SELECT id FROM public.support_threads
     WHERE status IN ('open','pending','waiting','in_progress')
     ORDER BY created_at, id
  LOOP
    -- Same per-ticket lock as help_center_enqueue: serialises with live triggers.
    PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || t.id::text, 0));
    -- Re-check after the lock (fresh snapshot per statement under READ COMMITTED).
    IF EXISTS (SELECT 1 FROM public.help_center_ticket_outbox WHERE ticket_id = t.id) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(max(revision), 0) + 1 INTO v_rev
      FROM public.help_center_ticket_outbox WHERE ticket_id = t.id;
    INSERT INTO public.help_center_ticket_outbox
      (ticket_id, event_type, status, revision, ticket_created_at, ticket_updated_at)
    SELECT s.id, 'case.created', s.status, v_rev, s.created_at, coalesce(s.updated_at, now())
      FROM public.support_threads s
     WHERE s.id = t.id AND s.status IN ('open','pending','waiting','in_progress');
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  IF v_count > 0 THEN
    PERFORM public.help_center_outbox_wake();
  END IF;
  RETURN jsonb_build_object('enqueued', v_count);
END $$;
REVOKE ALL ON FUNCTION public.help_center_initial_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_initial_sync() TO service_role;