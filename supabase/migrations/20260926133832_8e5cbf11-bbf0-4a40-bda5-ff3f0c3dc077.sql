-- Phase 2 Stage 0: additive infrastructure only. Dispatch OFF and locked.
CREATE TABLE public.maintenance_agent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  dispatch_mode text NOT NULL DEFAULT 'off' CHECK (dispatch_mode IN ('off','shadow','pilot')),
  lovable_instructions_enabled boolean NOT NULL DEFAULT false,
  stage_lock boolean NOT NULL DEFAULT true,
  pilot_allowlist text[] NOT NULL DEFAULT '{}'::text[],
  max_dispatches_per_day int NOT NULL DEFAULT 20 CHECK (max_dispatches_per_day BETWEEN 0 AND 200),
  max_active_cases int NOT NULL DEFAULT 3 CHECK (max_active_cases BETWEEN 0 AND 20),
  max_instructions_per_day int NOT NULL DEFAULT 10 CHECK (max_instructions_per_day BETWEEN 0 AND 100),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.maintenance_agent_settings TO authenticated;
GRANT ALL ON public.maintenance_agent_settings TO service_role;
ALTER TABLE public.maintenance_agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read agent settings" ON public.maintenance_agent_settings FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
INSERT INTO public.maintenance_agent_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- While stage_lock is on, dispatch and Lovable instructions cannot be switched on.
CREATE OR REPLACE FUNCTION public.guard_maintenance_agent_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage_lock AND (NEW.dispatch_mode <> 'off' OR NEW.lovable_instructions_enabled) THEN
    RAISE EXCEPTION 'maintenance_agent_settings: Stage 0 lock is on — dispatch and Lovable instructions must stay off';
  END IF;
  IF NEW.dispatch_mode = 'off' AND NEW.lovable_instructions_enabled THEN
    RAISE EXCEPTION 'maintenance_agent_settings: Lovable instructions require dispatch to be on';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_maintenance_agent_settings BEFORE INSERT OR UPDATE ON public.maintenance_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_agent_settings();

-- Outbox of hand-offs to the authorised external agent.
CREATE TABLE public.maintenance_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.maintenance_cases(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','delivered','claimed','expired','failed','dead','cancelled','completed')),
  attempt int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  claimed_by text,
  packet jsonb,
  packet_hash text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX maintenance_dispatches_one_active ON public.maintenance_dispatches(case_id) WHERE state IN ('pending','delivered','claimed');
CREATE INDEX maintenance_dispatches_due ON public.maintenance_dispatches(state, next_attempt_at);
GRANT SELECT ON public.maintenance_dispatches TO authenticated;
GRANT ALL ON public.maintenance_dispatches TO service_role;
ALTER TABLE public.maintenance_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read dispatches" ON public.maintenance_dispatches FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE TRIGGER update_maintenance_dispatches_updated_at BEFORE UPDATE ON public.maintenance_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Replay protection for signed agent requests (server-only).
CREATE TABLE public.maintenance_agent_nonces (
  nonce text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.maintenance_agent_nonces TO service_role;
ALTER TABLE public.maintenance_agent_nonces ENABLE ROW LEVEL SECURITY;
CREATE INDEX maintenance_agent_nonces_seen ON public.maintenance_agent_nonces(seen_at);

-- Case / requester / action audit + correlation fields.
ALTER TABLE public.maintenance_cases ADD COLUMN IF NOT EXISTS agent_stage text
  CHECK (agent_stage IN ('queued_for_agent','agent_investigating','sent_to_lovable','lovable_working','tests_passed','tests_failed','ready_for_review','approved','released','unable_to_resolve','agent_unreachable'));
ALTER TABLE public.maintenance_case_requesters ADD COLUMN IF NOT EXISTS scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.maintenance_actions
  ADD COLUMN IF NOT EXISTS execution_class text NOT NULL DEFAULT 'prepare'
    CHECK (execution_class IN ('investigate','prepare','test','execute_live','release')),
  ADD COLUMN IF NOT EXISTS correlation_tag text,
  ADD COLUMN IF NOT EXISTS sent_hash text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS commit_sha text,
  ADD COLUMN IF NOT EXISTS tests jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Automated actors cannot mark a case approved/released via agent_stage either.
CREATE OR REPLACE FUNCTION public.guard_maintenance_agent_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.agent_stage IS DISTINCT FROM OLD.agent_stage
     AND NEW.agent_stage IN ('approved','released')
     AND NEW.last_actor_type IN ('system','assistant','agent') THEN
    RAISE EXCEPTION 'maintenance_cases: automated actors cannot set agent stage %', NEW.agent_stage;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_maintenance_agent_stage BEFORE UPDATE OF agent_stage ON public.maintenance_cases
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_agent_stage();

-- Actions can only become approved with a named human approver; live/release classes always need one.
CREATE OR REPLACE FUNCTION public.guard_maintenance_action_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.state = 'approved' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'approved') AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'maintenance_actions: approval requires a named approver';
  END IF;
  IF NEW.execution_class IN ('execute_live','release') AND NEW.state IN ('queued','in_progress') AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'maintenance_actions: live changes and releases require approval before execution';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_maintenance_action_approval BEFORE INSERT OR UPDATE ON public.maintenance_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_action_approval();

-- Enqueue (only acts when dispatch is on; Stage 0 keeps it off, so this is inert).
CREATE OR REPLACE FUNCTION public.maintenance_enqueue_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.maintenance_agent_settings;
BEGIN
  SELECT * INTO s FROM public.maintenance_agent_settings WHERE id;
  IF s IS NULL OR s.dispatch_mode = 'off' THEN RETURN NEW; END IF;
  IF NEW.kind <> 'bug' OR NEW.status NOT IN ('new','analysing') THEN RETURN NEW; END IF;
  IF s.dispatch_mode = 'pilot' AND NOT (NEW.sensitive_areas = '{}'::text[] AND NEW.risk = 'low') THEN
    -- pilot still dispatches for investigation; execution gating happens server-side
    NULL;
  END IF;
  INSERT INTO public.maintenance_dispatches (case_id, idempotency_key)
  VALUES (NEW.id, NEW.id::text || ':' || COALESCE(NEW.current_analysis_id::text, 'initial'))
  ON CONFLICT DO NOTHING;
  UPDATE public.maintenance_cases SET agent_stage = 'queued_for_agent'
    WHERE id = NEW.id AND agent_stage IS NULL;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.maintenance_enqueue_dispatch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_maintenance_enqueue_dispatch AFTER INSERT OR UPDATE OF status ON public.maintenance_cases
  FOR EACH ROW EXECUTE FUNCTION public.maintenance_enqueue_dispatch();

-- Atomic lease claim for the agent function (service role only).
CREATE OR REPLACE FUNCTION public.maintenance_claim_dispatch(_dispatch_id uuid, _agent text, _lease_minutes int DEFAULT 30)
RETURNS public.maintenance_dispatches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.maintenance_dispatches;
BEGIN
  UPDATE public.maintenance_dispatches
     SET state = 'claimed', claimed_by = _agent,
         lease_expires_at = now() + make_interval(mins => LEAST(GREATEST(_lease_minutes, 5), 60)),
         attempt = attempt + 1
   WHERE id = _dispatch_id
     AND (state IN ('pending','delivered') OR (state = 'claimed' AND lease_expires_at < now()))
  RETURNING * INTO d;
  RETURN d;
END $$;
REVOKE EXECUTE ON FUNCTION public.maintenance_claim_dispatch(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_claim_dispatch(uuid, text, int) TO service_role;