ALTER TABLE public.help_center_ticket_outbox
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'case.updated'
    CHECK (event_type IN ('case.created','case.updated','case.deleted')),
  ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION public.help_center_outbox_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'help_center_ticket_outbox is append-only';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.ticket_created_at IS DISTINCT FROM OLD.ticket_created_at
     OR NEW.ticket_updated_at IS DISTINCT FROM OLD.ticket_updated_at
     OR NEW.enqueued_at IS DISTINCT FROM OLD.enqueued_at THEN
    RAISE EXCEPTION 'help_center_ticket_outbox payload is immutable';
  END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'delivered outbox events are final';
  END IF;
  RETURN NEW;
END $$;

-- Shared enqueue helper (metadata only).
CREATE OR REPLACE FUNCTION public.help_center_enqueue(p_ticket uuid, p_type text, p_status text, p_created timestamptz, p_updated timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || p_ticket::text, 0));
  SELECT coalesce(max(revision), 0) + 1 INTO v_rev
    FROM public.help_center_ticket_outbox WHERE ticket_id = p_ticket;
  INSERT INTO public.help_center_ticket_outbox
    (ticket_id, event_type, status, revision, ticket_created_at, ticket_updated_at)
  VALUES (p_ticket, p_type, coalesce(p_status, 'open'), v_rev, p_created, coalesce(p_updated, now()));
  PERFORM public.help_center_outbox_wake();
END $$;
REVOKE ALL ON FUNCTION public.help_center_enqueue(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.help_center_enqueue_ticket_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.help_center_enqueue(NEW.id, 'case.created', NEW.status, NEW.created_at, NEW.updated_at);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.help_center_enqueue(OLD.id, 'case.deleted', OLD.status, OLD.created_at, now());
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.help_center_enqueue(NEW.id, 'case.updated', NEW.status, NEW.created_at, NEW.updated_at);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.help_center_enqueue_ticket_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS help_center_enqueue_ticket_event_trg ON public.support_threads;
CREATE TRIGGER help_center_enqueue_ticket_event_trg
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.help_center_enqueue_ticket_event();

-- Message activity => case.updated even when status is unchanged (content never exported).
CREATE OR REPLACE FUNCTION public.help_center_enqueue_message_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id, status, created_at INTO t FROM public.support_threads WHERE id = NEW.thread_id;
  IF FOUND THEN
    PERFORM public.help_center_enqueue(t.id, 'case.updated', t.status, t.created_at, NEW.created_at);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.help_center_enqueue_message_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS help_center_enqueue_message_event_trg ON public.support_messages;
CREATE TRIGGER help_center_enqueue_message_event_trg
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.help_center_enqueue_message_event();