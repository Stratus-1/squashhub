-- ============ AI Maintenance Manager — Phase 1 ============

CREATE TABLE public.maintenance_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bug','support_task','feature')),
  bug_report_id uuid UNIQUE REFERENCES public.ai_bug_reports(id) ON DELETE SET NULL,
  ticket_id uuid UNIQUE REFERENCES public.support_threads(id) ON DELETE SET NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','analysing','needs_info','issue_identified','fix_in_progress','awaiting_approval','approved','ready_for_release','released','completed','unable_to_resolve','rejected')),
  risk text NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
  sensitive_areas text[] NOT NULL DEFAULT '{}'::text[],
  requires_approval boolean NOT NULL DEFAULT false,
  last_actor_type text NOT NULL DEFAULT 'system' CHECK (last_actor_type IN ('system','assistant','agent','super_admin')),
  current_analysis_id uuid,
  technical_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  released_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_cases_status_idx ON public.maintenance_cases(status, updated_at DESC);
CREATE INDEX maintenance_cases_club_idx ON public.maintenance_cases(club_id, updated_at DESC);

CREATE TABLE public.maintenance_case_requesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.maintenance_cases(id) ON DELETE CASCADE,
  interaction_id uuid REFERENCES public.ai_assist_interactions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX maintenance_case_requesters_uniq ON public.maintenance_case_requesters(case_id, interaction_id) WHERE interaction_id IS NOT NULL;
CREATE INDEX maintenance_case_requesters_user_idx ON public.maintenance_case_requesters(user_id);

CREATE TABLE public.maintenance_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.maintenance_cases(id) ON DELETE CASCADE,
  summary text NOT NULL,
  affected_module text,
  probable_cause text,
  classification text,
  proposed_action text,
  risk text CHECK (risk IN ('low','medium','high')),
  code_change_needed boolean,
  db_change_needed boolean,
  more_info_needed boolean NOT NULL DEFAULT false,
  info_request text,
  actor_type text NOT NULL DEFAULT 'assistant' CHECK (actor_type IN ('system','assistant','agent','super_admin')),
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_analyses_case_idx ON public.maintenance_analyses(case_id, created_at DESC);

CREATE TABLE public.maintenance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.maintenance_cases(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lovable_instruction','data_fix','config','member_reply')),
  instruction_text text NOT NULL,
  target text NOT NULL DEFAULT 'manual' CHECK (target IN ('lovable','github','manual')),
  external_ref text,
  risk text NOT NULL DEFAULT 'medium' CHECK (risk IN ('low','medium','high')),
  sensitive_areas text[] NOT NULL DEFAULT '{}'::text[],
  auto_allowed boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','queued','in_progress','result_received','awaiting_approval','approved','rejected','done')),
  result_summary text,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_actions_case_idx ON public.maintenance_actions(case_id, created_at DESC);

CREATE TABLE public.maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.maintenance_cases(id) ON DELETE CASCADE,
  action_id uuid,
  from_status text,
  to_status text,
  actor_type text NOT NULL CHECK (actor_type IN ('system','assistant','agent','super_admin')),
  actor_label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_events_case_idx ON public.maintenance_events(case_id, created_at DESC);

-- Grants: Super Admin read via RLS; writes only through the backend function (service role).
GRANT SELECT ON public.maintenance_cases, public.maintenance_case_requesters, public.maintenance_analyses, public.maintenance_actions, public.maintenance_events TO authenticated;
GRANT ALL ON public.maintenance_cases, public.maintenance_case_requesters, public.maintenance_analyses, public.maintenance_actions, public.maintenance_events TO service_role;
ALTER TABLE public.maintenance_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_case_requesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read maintenance cases" ON public.maintenance_cases FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Super admins read maintenance requesters" ON public.maintenance_case_requesters FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.maintenance_cases c WHERE c.id = maintenance_case_requesters.case_id AND public.is_platform_admin(auth.uid())));
CREATE POLICY "Super admins read maintenance analyses" ON public.maintenance_analyses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.maintenance_cases c WHERE c.id = maintenance_analyses.case_id AND public.is_platform_admin(auth.uid())));
CREATE POLICY "Super admins read maintenance actions" ON public.maintenance_actions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.maintenance_cases c WHERE c.id = maintenance_actions.case_id AND public.is_platform_admin(auth.uid())));
CREATE POLICY "Super admins read maintenance events" ON public.maintenance_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.maintenance_cases c WHERE c.id = maintenance_events.case_id AND public.is_platform_admin(auth.uid())));

-- Triage column on assistant requests (additive; existing rows untouched).
ALTER TABLE public.ai_assist_interactions ADD COLUMN IF NOT EXISTS triage text CHECK (triage IN ('question','safe_action','bug','feature_request','needs_info','support'));

-- ============ State machine ============
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
    ('ready_for_release','released'),('ready_for_release','rejected'),
    ('released','completed')
  );
$$;

-- Guard: refuse invalid transitions; automated actors never get past ready_for_release.
CREATE OR REPLACE FUNCTION public.guard_maintenance_case_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT public.maintenance_case_can_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'maintenance_cases: invalid transition % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.last_actor_type IN ('system','assistant','agent') AND NEW.status IN ('approved','released','completed') THEN
    RAISE EXCEPTION 'maintenance_cases: automated actors cannot approve, release or complete a case';
  END IF;
  IF NEW.status = 'released' THEN NEW.released_at := now(); END IF;
  IF NEW.status IN ('completed','unable_to_resolve','rejected') THEN NEW.closed_at := COALESCE(NEW.closed_at, now()); ELSE NEW.closed_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_maintenance_case ON public.maintenance_cases;
CREATE TRIGGER trg_guard_maintenance_case BEFORE UPDATE OF status ON public.maintenance_cases
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_case_transition();

-- Event log on every case change.
CREATE OR REPLACE FUNCTION public.maintenance_case_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.maintenance_events (case_id, from_status, to_status, actor_type, actor_label, note)
  VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status, NEW.last_actor_type, NULL, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_maintenance_case_event ON public.maintenance_cases;
CREATE TRIGGER trg_maintenance_case_event AFTER INSERT OR UPDATE OF status ON public.maintenance_cases
FOR EACH ROW EXECUTE FUNCTION public.maintenance_case_event();

-- Authoritative case status drives the derived bug status (never the other way round).
CREATE OR REPLACE FUNCTION public.sync_maintenance_bug_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE mapped text;
BEGIN
  IF NEW.bug_report_id IS NULL THEN RETURN NEW; END IF;
  mapped := CASE NEW.status
    WHEN 'new' THEN 'investigating' WHEN 'analysing' THEN 'investigating' WHEN 'needs_info' THEN 'investigating'
    WHEN 'issue_identified' THEN 'fix_in_development' WHEN 'fix_in_progress' THEN 'fix_in_development'
    WHEN 'awaiting_approval' THEN 'fix_in_development' WHEN 'approved' THEN 'fix_in_development'
    WHEN 'ready_for_release' THEN 'fix_ready' WHEN 'released' THEN 'published' WHEN 'completed' THEN 'fixed'
    WHEN 'unable_to_resolve' THEN 'wont_fix' WHEN 'rejected' THEN 'wont_fix'
    ELSE NULL END;
  IF mapped IS NOT NULL THEN
    UPDATE public.ai_bug_reports SET status = mapped, updated_at = now()
    WHERE id = NEW.bug_report_id AND status IS DISTINCT FROM mapped;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_maintenance_bug ON public.maintenance_cases;
CREATE TRIGGER trg_sync_maintenance_bug AFTER UPDATE OF status ON public.maintenance_cases
FOR EACH ROW EXECUTE FUNCTION public.sync_maintenance_bug_status();

-- One case per bug: created on insert, moved back to analysing on a live reopen (regression).
CREATE OR REPLACE FUNCTION public.maintenance_case_from_bug()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cid uuid; r text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    r := CASE NEW.severity WHEN 'critical' THEN 'high' WHEN 'high' THEN 'high' WHEN 'medium' THEN 'medium' ELSE 'low' END;
    INSERT INTO public.maintenance_cases (kind, bug_report_id, club_id, title, risk, requires_approval, status, last_actor_type)
    VALUES ('bug', NEW.id, NEW.club_id, NEW.title, r, r <> 'low', 'new', 'system')
    ON CONFLICT (bug_report_id) DO NOTHING;
  ELSIF OLD.status IN ('fixed','closed','wont_fix') AND NEW.status = 'open' THEN
    UPDATE public.maintenance_cases SET status = 'analysing', last_actor_type = 'system', updated_at = now()
    WHERE bug_report_id = NEW.id AND status IN ('released','completed','ready_for_release') AND last_actor_type IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_maintenance_case_from_bug ON public.ai_bug_reports;
CREATE TRIGGER trg_maintenance_case_from_bug AFTER INSERT OR UPDATE OF status ON public.ai_bug_reports
FOR EACH ROW EXECUTE FUNCTION public.maintenance_case_from_bug();

-- Requesters are linked automatically from assistant requests (bugs and support escalations);
-- a support escalation gets one support_task case per ticket.
CREATE OR REPLACE FUNCTION public.maintenance_case_from_interaction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF NEW.bug_report_id IS NOT NULL THEN
    SELECT id INTO cid FROM public.maintenance_cases WHERE bug_report_id = NEW.bug_report_id;
    IF cid IS NOT NULL THEN
      INSERT INTO public.maintenance_case_requesters (case_id, interaction_id, user_id)
      VALUES (cid, NEW.id, NEW.user_id) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.ticket_id IS NOT NULL AND NEW.status IN ('escalated','failed') THEN
    SELECT id INTO cid FROM public.maintenance_cases WHERE ticket_id = NEW.ticket_id;
    IF cid IS NULL THEN
      INSERT INTO public.maintenance_cases (kind, ticket_id, club_id, title, risk, requires_approval, status, last_actor_type)
      VALUES ('support_task', NEW.ticket_id, NEW.club_id, left(COALESCE(NULLIF(NEW.request_text, ''), 'Support request'), 120), 'medium', true, 'new', 'system')
      RETURNING id INTO cid;
    END IF;
    INSERT INTO public.maintenance_case_requesters (case_id, interaction_id, user_id)
    VALUES (cid, NEW.id, NEW.user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_maintenance_case_from_interaction ON public.ai_assist_interactions;
CREATE TRIGGER trg_maintenance_case_from_interaction AFTER INSERT OR UPDATE OF status, bug_report_id, ticket_id ON public.ai_assist_interactions
FOR EACH ROW EXECUTE FUNCTION public.maintenance_case_from_interaction();

-- Requester-safe case status lookup (for My Requests), scoped to their own requests.
CREATE OR REPLACE FUNCTION public.my_ai_maintenance_statuses(_bug_ids uuid[])
RETURNS TABLE (bug_report_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.bug_report_id, c.status
  FROM public.maintenance_cases c
  WHERE c.bug_report_id = ANY(_bug_ids)
    AND EXISTS (SELECT 1 FROM public.maintenance_case_requesters r WHERE r.case_id = c.id AND r.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.my_ai_maintenance_statuses(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_maintenance_statuses(uuid[]) TO authenticated;

-- updated_at triggers on mutable tables.
CREATE TRIGGER update_maintenance_cases_updated_at BEFORE UPDATE ON public.maintenance_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_actions_updated_at BEFORE UPDATE ON public.maintenance_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_requesters_updated_at BEFORE UPDATE ON public.maintenance_case_requesters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Backfill open bugs and their requesters ============
INSERT INTO public.maintenance_cases (kind, bug_report_id, club_id, title, risk, requires_approval, status, last_actor_type)
SELECT 'bug', b.id, b.club_id, b.title,
  CASE b.severity WHEN 'critical' THEN 'high' WHEN 'high' THEN 'high' WHEN 'medium' THEN 'medium' ELSE 'low' END,
  b.severity IN ('critical','high'),
  CASE b.status WHEN 'published' THEN 'released' WHEN 'fix_ready' THEN 'ready_for_release' WHEN 'fix_in_development' THEN 'fix_in_progress' ELSE 'analysing' END,
  'system'
FROM public.ai_bug_reports b
WHERE b.status IN ('open','investigating','fix_in_development','fix_ready','published')
ON CONFLICT (bug_report_id) DO NOTHING;

INSERT INTO public.maintenance_case_requesters (case_id, interaction_id, user_id)
SELECT c.id, i.id, i.user_id
FROM public.ai_assist_interactions i
JOIN public.maintenance_cases c ON c.bug_report_id = i.bug_report_id
WHERE i.bug_report_id IS NOT NULL
ON CONFLICT DO NOTHING;
