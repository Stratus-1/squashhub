-- Help Center product action API (reply | set_status).
-- Additive: one append-only audit/idempotency table and one service-role-only writer.
-- Reply bodies and personal details are never stored in the audit table; replies live only in support_messages.

CREATE TABLE IF NOT EXISTS public.help_center_case_actions (
  id bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('reply', 'set_status')),
  event_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  expected_revision bigint NOT NULL,
  result_revision bigint NOT NULL,
  result_status text NOT NULL,
  message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.help_center_case_actions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.help_center_case_actions_id_seq TO service_role;
REVOKE ALL ON public.help_center_case_actions FROM PUBLIC, anon, authenticated;
ALTER TABLE public.help_center_case_actions ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.help_center_case_actions IS 'Append-only Help Center product action audit/idempotency log. No message bodies or personal details.';

CREATE OR REPLACE FUNCTION public.help_center_case_actions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'help_center_case_actions is append-only';
END $$;

DROP TRIGGER IF EXISTS help_center_case_actions_append_only_trg ON public.help_center_case_actions;
CREATE TRIGGER help_center_case_actions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.help_center_case_actions
  FOR EACH ROW EXECUTE FUNCTION public.help_center_case_actions_append_only();
DROP TRIGGER IF EXISTS help_center_case_actions_no_truncate ON public.help_center_case_actions;
CREATE TRIGGER help_center_case_actions_no_truncate
  BEFORE TRUNCATE ON public.help_center_case_actions
  FOR EACH STATEMENT EXECUTE FUNCTION public.help_center_case_actions_append_only();

-- Resolves an IAP operator email to an existing auth user holding the SquashHub platform admin role.
CREATE OR REPLACE FUNCTION public.help_center_resolve_platform_operator(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id FROM auth.users u
  WHERE p_email IS NOT NULL AND lower(u.email) = lower(trim(p_email))
    AND u.deleted_at IS NULL
    AND public.is_platform_admin(u.id)
    AND (SELECT count(*) FROM auth.users d WHERE lower(d.email) = lower(trim(p_email))) = 1
  LIMIT 1
$$;

-- Single atomic writer. Writes go through the established support_messages / support_threads
-- paths so existing triggers publish the next outbox revision.
CREATE OR REPLACE FUNCTION public.help_center_apply_case_action(
  p_action text,
  p_event_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_request_hash text,
  p_actor_user_id uuid,
  p_message text DEFAULT NULL,
  p_target_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prior public.help_center_case_actions%ROWTYPE;
  v_event record;
  v_latest record;
  v_thread record;
  v_status text;
  v_message_id uuid;
  v_revision bigint;
  v_result_status text;
BEGIN
  IF p_action NOT IN ('reply', 'set_status') OR p_event_id IS NULL OR p_expected_revision IS NULL
     OR p_idempotency_key IS NULL OR p_request_hash IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;
  IF NOT public.is_platform_admin(p_actor_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hc_action:' || p_idempotency_key, 0));
  SELECT * INTO v_prior FROM public.help_center_case_actions WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prior.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'action', v_prior.action,
      'source_revision', v_prior.result_revision, 'resulting_status', v_prior.result_status);
  END IF;

  SELECT event_id, ticket_id, revision, held_at, event_type INTO v_event
    FROM public.help_center_ticket_outbox WHERE event_id = p_event_id;
  IF NOT FOUND OR v_event.event_type NOT IN ('case.created', 'case.updated') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_unavailable');
  END IF;
  IF v_event.held_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_held');
  END IF;

  -- Same lock as help_center_enqueue: the latest revision cannot move under us.
  PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || v_event.ticket_id::text, 0));
  SELECT id, status INTO v_thread FROM public.support_threads WHERE id = v_event.ticket_id FOR UPDATE;
  IF NOT FOUND OR v_thread.status NOT IN ('open', 'pending', 'waiting', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ticket_inactive');
  END IF;
  SELECT event_id, revision INTO v_latest FROM public.help_center_ticket_outbox
    WHERE ticket_id = v_event.ticket_id ORDER BY revision DESC LIMIT 1;
  IF v_latest.event_id <> v_event.event_id OR v_latest.revision <> p_expected_revision
     OR v_event.revision <> p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_revision');
  END IF;

  IF p_action = 'reply' THEN
    IF p_message IS NULL OR length(btrim(p_message)) = 0 OR length(p_message) > 4000 OR p_target_status IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
    INSERT INTO public.support_messages (thread_id, sender_id, body)
      VALUES (v_event.ticket_id, p_actor_user_id, btrim(p_message))
      RETURNING id INTO v_message_id;
  ELSE
    IF p_message IS NOT NULL OR p_target_status NOT IN ('open', 'waiting', 'in_progress', 'resolved', 'closed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
    -- Product stores the feed's "waiting" as "pending".
    v_status := CASE WHEN p_target_status = 'waiting' THEN 'pending' ELSE p_target_status END;
    IF v_status = v_thread.status OR (v_thread.status = 'waiting' AND v_status = 'pending') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'status_unchanged');
    END IF;
    UPDATE public.support_threads SET status = v_status, updated_at = now() WHERE id = v_event.ticket_id;
  END IF;

  SELECT max(revision) INTO v_revision FROM public.help_center_ticket_outbox WHERE ticket_id = v_event.ticket_id;
  SELECT CASE WHEN status = 'pending' THEN 'waiting' ELSE status END INTO v_result_status
    FROM public.support_threads WHERE id = v_event.ticket_id;

  INSERT INTO public.help_center_case_actions
    (idempotency_key, request_hash, action, event_id, ticket_id, actor_user_id,
     expected_revision, result_revision, result_status, message_id)
  VALUES (p_idempotency_key, p_request_hash, p_action, p_event_id, v_event.ticket_id, p_actor_user_id,
     p_expected_revision, v_revision, v_result_status, v_message_id);

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'action', p_action,
    'source_revision', v_revision, 'resulting_status', v_result_status,
    'message_id', v_message_id, 'ticket_id', v_event.ticket_id);
END $$;

REVOKE ALL ON FUNCTION public.help_center_resolve_platform_operator(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_resolve_platform_operator(text) TO service_role;
REVOKE ALL ON FUNCTION public.help_center_apply_case_action(text, uuid, bigint, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_apply_case_action(text, uuid, bigint, text, text, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.help_center_case_actions_append_only() FROM PUBLIC, anon, authenticated;