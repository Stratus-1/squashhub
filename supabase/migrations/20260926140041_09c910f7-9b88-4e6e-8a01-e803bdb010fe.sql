ALTER TABLE public.maintenance_agent_settings
  ADD COLUMN IF NOT EXISTS auto_release_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_release_circuit_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_release_circuit_reason text,
  ADD COLUMN IF NOT EXISTS auto_release_circuit_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_release_failure_threshold int NOT NULL DEFAULT 2 CHECK (auto_release_failure_threshold BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS max_auto_releases_per_day int NOT NULL DEFAULT 3 CHECK (max_auto_releases_per_day BETWEEN 0 AND 20);

CREATE OR REPLACE FUNCTION public.guard_maintenance_agent_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage_lock AND (NEW.dispatch_mode <> 'off' OR NEW.lovable_instructions_enabled OR NEW.auto_release_enabled) THEN
    RAISE EXCEPTION 'maintenance_agent_settings: Stage 0 lock is on — dispatch, Lovable instructions and auto-release must stay off';
  END IF;
  IF NEW.dispatch_mode = 'off' AND NEW.lovable_instructions_enabled THEN
    RAISE EXCEPTION 'maintenance_agent_settings: Lovable instructions require dispatch to be on';
  END IF;
  IF NEW.auto_release_enabled AND (NEW.dispatch_mode <> 'pilot' OR NOT NEW.lovable_instructions_enabled) THEN
    RAISE EXCEPTION 'maintenance_agent_settings: auto-release requires pilot dispatch and Lovable instructions';
  END IF;
  IF NEW.auto_release_enabled AND NEW.auto_release_circuit_open THEN
    RAISE EXCEPTION 'maintenance_agent_settings: auto-release circuit breaker is open — reset it first';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

ALTER TABLE public.maintenance_cases
  ADD COLUMN IF NOT EXISTS auto_fixed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_path text CHECK (resolution_path IN ('auto_release','human_release','operational','rejected','unable'));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.maintenance_cases'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%agent_stage%' LOOP
    EXECUTE format('ALTER TABLE public.maintenance_cases DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.maintenance_cases ADD CONSTRAINT maintenance_cases_agent_stage_check CHECK (agent_stage IN (
  'queued_for_agent','agent_investigating','sent_to_lovable','lovable_working','tests_passed','tests_failed',
  'ready_for_review','approved','released','unable_to_resolve','agent_unreachable',
  'auto_release_qualified','auto_releasing','verifying','auto_released','rolled_back','escalated'));

ALTER TABLE public.maintenance_actions
  ADD COLUMN IF NOT EXISTS auto_released boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_release_qualification jsonb,
  ADD COLUMN IF NOT EXISTS deploy_result jsonb,
  ADD COLUMN IF NOT EXISTS verification jsonb,
  ADD COLUMN IF NOT EXISTS rollback jsonb;

-- Regression after release: reopen for investigation.
CREATE OR REPLACE FUNCTION public.maintenance_case_can_transition(_from text, _to text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _from = _to OR (_from, _to) IN (
    ('new','analysing'),('new','needs_info'),('new','unable_to_resolve'),('new','rejected'),
    ('analysing','issue_identified'),('analysing','needs_info'),('analysing','unable_to_resolve'),('analysing','rejected'),
    ('needs_info','analysing'),
    ('issue_identified','fix_in_progress'),('issue_identified','awaiting_approval'),('issue_identified','unable_to_resolve'),('issue_identified','rejected'),
    ('awaiting_approval','approved'),('awaiting_approval','rejected'),
    ('approved','fix_in_progress'),('approved','ready_for_release'),
    ('fix_in_progress','ready_for_release'),('fix_in_progress','issue_identified'),('fix_in_progress','unable_to_resolve'),
    ('ready_for_release','released'),('ready_for_release','rejected'),('ready_for_release','awaiting_approval'),
    ('released','completed'),('released','issue_identified')
  );
$$;

-- Is there a fully qualified, deployed (and optionally verified) automatic release for this case?
CREATE OR REPLACE FUNCTION public.maintenance_auto_release_ok(_case_id uuid, _need_verified boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_cases c
    JOIN public.maintenance_agent_settings s ON s.id
    JOIN public.maintenance_actions a ON a.case_id = c.id
    WHERE c.id = _case_id AND c.risk = 'low' AND COALESCE(c.sensitive_areas, '{}'::text[]) = '{}'::text[]
      AND s.auto_release_enabled AND NOT s.auto_release_circuit_open AND NOT s.stage_lock
      AND a.execution_class = 'release' AND a.auto_released
      AND (a.auto_release_qualification->>'eligible') = 'true'
      AND (a.deploy_result->>'ok') = 'true'
      AND (NOT _need_verified OR (a.verification->>'passed') = 'true')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.maintenance_auto_release_ok(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_maintenance_case_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT public.maintenance_case_can_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'maintenance_cases: invalid transition % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.last_actor_type IN ('system','assistant','agent') THEN
    IF NEW.status = 'approved' THEN
      RAISE EXCEPTION 'maintenance_cases: automated actors cannot approve a case';
    ELSIF NEW.status = 'released' AND NOT public.maintenance_auto_release_ok(NEW.id, false) THEN
      RAISE EXCEPTION 'maintenance_cases: automated actors cannot approve, release or complete a case without a qualified automatic release';
    ELSIF NEW.status = 'completed' AND NOT public.maintenance_auto_release_ok(NEW.id, true) THEN
      RAISE EXCEPTION 'maintenance_cases: automated actors cannot approve, release or complete a case without a verified automatic release';
    END IF;
  END IF;
  IF NEW.status = 'released' THEN NEW.released_at := now(); END IF;
  IF NEW.status IN ('completed','unable_to_resolve','rejected') THEN NEW.closed_at := COALESCE(NEW.closed_at, now()); ELSE NEW.closed_at := NULL; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_maintenance_agent_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.agent_stage IS DISTINCT FROM OLD.agent_stage AND NEW.last_actor_type IN ('system','assistant','agent') THEN
    IF NEW.agent_stage IN ('approved','released') THEN
      RAISE EXCEPTION 'maintenance_cases: automated actors cannot set agent stage %', NEW.agent_stage;
    END IF;
    IF NEW.agent_stage = 'auto_released' AND NOT (NEW.status = 'completed' AND public.maintenance_auto_release_ok(NEW.id, true)) THEN
      RAISE EXCEPTION 'maintenance_cases: auto_released requires a verified qualified release';
    END IF;
  END IF;
  IF NEW.auto_fixed AND NOT COALESCE(OLD.auto_fixed, false) AND NOT public.maintenance_auto_release_ok(NEW.id, true) THEN
    RAISE EXCEPTION 'maintenance_cases: auto_fixed requires a verified qualified release';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_maintenance_agent_stage ON public.maintenance_cases;
CREATE TRIGGER trg_guard_maintenance_agent_stage BEFORE UPDATE OF agent_stage, auto_fixed ON public.maintenance_cases
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_agent_stage();

CREATE OR REPLACE FUNCTION public.guard_maintenance_action_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s public.maintenance_agent_settings; c public.maintenance_cases;
BEGIN
  IF NEW.state = 'approved' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'approved') AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'maintenance_actions: approval requires a named approver';
  END IF;
  IF NEW.auto_released THEN
    SELECT * INTO s FROM public.maintenance_agent_settings WHERE id;
    SELECT * INTO c FROM public.maintenance_cases WHERE id = NEW.case_id;
    IF NEW.execution_class <> 'release'
       OR (NEW.auto_release_qualification->>'eligible') IS DISTINCT FROM 'true'
       OR s IS NULL OR NOT s.auto_release_enabled OR s.auto_release_circuit_open OR s.stage_lock
       OR c.risk <> 'low' OR COALESCE(c.sensitive_areas, '{}'::text[]) <> '{}'::text[] THEN
      RAISE EXCEPTION 'maintenance_actions: automatic release is not permitted for this action';
    END IF;
  END IF;
  IF NEW.execution_class IN ('execute_live','release') AND NEW.state IN ('queued','in_progress') AND NEW.approved_by IS NULL
     AND NOT (NEW.execution_class = 'release' AND NEW.auto_released) THEN
    RAISE EXCEPTION 'maintenance_actions: live changes and releases require approval before execution';
  END IF;
  RETURN NEW;
END $$;

-- Circuit breaker: repeated failed automatic releases switch auto-release off.
CREATE OR REPLACE FUNCTION public.maintenance_auto_release_circuit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.maintenance_agent_settings; fails int;
BEGIN
  IF NOT NEW.auto_released THEN RETURN NEW; END IF;
  IF NOT ((NEW.deploy_result->>'ok') = 'false' OR (NEW.verification->>'passed') = 'false') THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.maintenance_agent_settings WHERE id;
  SELECT count(*) INTO fails FROM public.maintenance_actions
   WHERE auto_released AND updated_at > now() - interval '7 days'
     AND ((deploy_result->>'ok') = 'false' OR (verification->>'passed') = 'false');
  IF fails >= COALESCE(s.auto_release_failure_threshold, 2) THEN
    UPDATE public.maintenance_agent_settings
       SET auto_release_enabled = false, auto_release_circuit_open = true,
           auto_release_circuit_reason = format('%s failed automatic releases in 7 days', fails),
           auto_release_circuit_opened_at = now()
     WHERE id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.maintenance_auto_release_circuit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_maintenance_auto_release_circuit AFTER UPDATE OF deploy_result, verification ON public.maintenance_actions
  FOR EACH ROW EXECUTE FUNCTION public.maintenance_auto_release_circuit();