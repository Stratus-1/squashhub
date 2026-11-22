ALTER TABLE public.club_journal_entries ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
COMMENT ON COLUMN public.club_journal_entries.created_by IS 'Auth user who posted the line (NULL = system/back-office).';

CREATE TABLE public.club_journal_entry_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  journal_ref uuid,
  club_member_id uuid,
  action text NOT NULL CHECK (action IN ('delete','edit')),
  actor_user_id uuid,
  old_row jsonb NOT NULL,
  new_row jsonb,
  note text,
  source text NOT NULL DEFAULT 'trigger',
  changed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.club_journal_entry_changes IS 'Append-only audit of deleted/edited club_journal_entries rows, written only by trigger _journal_entry_audit.';

GRANT SELECT ON public.club_journal_entry_changes TO authenticated;
GRANT ALL ON public.club_journal_entry_changes TO service_role;
ALTER TABLE public.club_journal_entry_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance readers view ledger changes" ON public.club_journal_entry_changes
  FOR SELECT TO authenticated
  USING (club_id IN (SELECT public.journal_read_club_ids()));

CREATE INDEX club_journal_entry_changes_club_idx ON public.club_journal_entry_changes (club_id, changed_at DESC);
CREATE INDEX club_journal_entry_changes_member_idx ON public.club_journal_entry_changes (club_member_id) WHERE club_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS club_journal_entries_reverses_idx ON public.club_journal_entries (reverses_journal_ref) WHERE reverses_journal_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public._journal_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _note text := nullif(current_setting('app.ledger_note', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.club_journal_entry_changes(club_id, entry_id, journal_ref, club_member_id, action, actor_user_id, old_row, note)
    VALUES (OLD.club_id, OLD.id, OLD.journal_ref, OLD.club_member_id, 'delete', auth.uid(), to_jsonb(OLD), _note);
    RETURN OLD;
  END IF;
  IF (OLD.account, OLD.debit, OLD.credit, OLD.description, OLD.club_member_id, OLD.custom_account_id, OLD.created_at, OLD.journal_ref)
     IS DISTINCT FROM
     (NEW.account, NEW.debit, NEW.credit, NEW.description, NEW.club_member_id, NEW.custom_account_id, NEW.created_at, NEW.journal_ref) THEN
    INSERT INTO public.club_journal_entry_changes(club_id, entry_id, journal_ref, club_member_id, action, actor_user_id, old_row, new_row, note)
    VALUES (NEW.club_id, NEW.id, NEW.journal_ref, COALESCE(NEW.club_member_id, OLD.club_member_id), 'edit', auth.uid(), to_jsonb(OLD), to_jsonb(NEW), _note);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._journal_entry_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER journal_entry_audit
  AFTER UPDATE OR DELETE ON public.club_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public._journal_entry_audit();

-- Backfill earlier deletions already captured line-by-line in ledger_audit_log.
INSERT INTO public.club_journal_entry_changes (club_id, entry_id, journal_ref, club_member_id, action, actor_user_id, old_row, note, changed_at, source)
SELECT DISTINCT ON ((e->>'id')::uuid)
  COALESCE(l.club_id, (e->>'club_id')::uuid), (e->>'id')::uuid, nullif(e->>'journal_ref','')::uuid,
  nullif(e->>'club_member_id','')::uuid, 'delete', l.actor_user_id, e, l.note, l.created_at, 'backfill'
FROM public.ledger_audit_log l
CROSS JOIN LATERAL jsonb_array_elements(l.before_json) e
WHERE l.action = 'delete'
  AND jsonb_typeof(l.before_json) = 'array'
  AND jsonb_typeof(e) = 'object'
  AND e ? 'account'
  AND (e->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND COALESCE(l.club_id::text, e->>'club_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j WHERE j.id = (e->>'id')::uuid)
ORDER BY (e->>'id')::uuid, l.created_at DESC;

CREATE OR REPLACE FUNCTION public._ledger_actor_name(p_club uuid, p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_user IS NULL THEN 'System' ELSE COALESCE(
    (SELECT cm.name FROM public.club_members cm WHERE cm.user_id = p_user AND cm.club_id = p_club AND nullif(trim(cm.name),'') IS NOT NULL ORDER BY cm.id LIMIT 1),
    (SELECT nullif(trim(p.name),'') FROM public.profiles p WHERE p.id = p_user),
    'Unknown user') END
$$;
REVOKE ALL ON FUNCTION public._ledger_actor_name(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.club_ledger_audit_trail(p_club_id uuid)
RETURNS TABLE (kind text, entry_id uuid, journal_ref uuid, club_member_id uuid, row_data jsonb, new_data jsonb, actor_name text, changed_at timestamptz, note text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_club_id IS NULL OR NOT (p_club_id IN (SELECT public.journal_read_club_ids())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT CASE c.action WHEN 'delete' THEN 'deleted' ELSE 'edited' END,
         c.entry_id, c.journal_ref, c.club_member_id, c.old_row, c.new_row,
         public._ledger_actor_name(c.club_id, c.actor_user_id), c.changed_at, c.note
  FROM public.club_journal_entry_changes c
  WHERE c.club_id = p_club_id
  UNION ALL
  SELECT 'reversed', NULL::uuid, r.orig_ref, NULL::uuid,
         jsonb_build_object('reversal_journal_ref', r.rev_ref), NULL::jsonb,
         public._ledger_actor_name(p_club_id, COALESCE(r.created_by, a.actor_user_id)),
         r.rev_at, a.note
  FROM (
    SELECT j.reverses_journal_ref AS orig_ref, j.journal_ref AS rev_ref,
           min(j.created_at) AS rev_at, (array_agg(j.created_by) FILTER (WHERE j.created_by IS NOT NULL))[1] AS created_by
    FROM public.club_journal_entries j
    WHERE j.club_id = p_club_id AND j.reverses_journal_ref IS NOT NULL
    GROUP BY j.reverses_journal_ref, j.journal_ref
  ) r
  LEFT JOIN LATERAL (
    SELECT l.actor_user_id, l.note FROM public.ledger_audit_log l
    WHERE l.club_id = p_club_id AND l.journal_ref = r.orig_ref AND l.action = 'reverse'
    ORDER BY l.created_at DESC LIMIT 1
  ) a ON true;
END $$;
REVOKE ALL ON FUNCTION public.club_ledger_audit_trail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_ledger_audit_trail(uuid) TO authenticated;