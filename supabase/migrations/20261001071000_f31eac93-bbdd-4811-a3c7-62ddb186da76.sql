-- Bounded, pilot-allowlisted case context for the Help Center's on-demand read path.
-- These service-role-only projections omit identity and attachment columns and
-- cap database-side text before it leaves Postgres.
CREATE OR REPLACE FUNCTION public.help_center_case_context_thread(p_ticket uuid)
RETURNS TABLE (
  ticket_id uuid,
  subject text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id,
         left(coalesce(nullif(btrim(t.subject), ''), 'SquashHub support ticket'), 180),
         t.status,
         t.created_at,
         t.updated_at
    FROM public.support_threads AS t
   WHERE t.id = p_ticket
     AND t.status IN ('open', 'pending', 'waiting', 'in_progress')
     AND EXISTS (
       SELECT 1 FROM public.help_center_pilot_allowlist AS a
        WHERE a.ticket_id = t.id
     )
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.help_center_case_context_messages(p_ticket uuid)
RETURNS TABLE (author_role text, body text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN m.sender_id = t.user_id THEN 'reporter' ELSE 'support' END,
         left(m.body, 2001),
         m.created_at
    FROM public.support_messages AS m
    JOIN public.support_threads AS t ON t.id = m.thread_id
   WHERE m.thread_id = p_ticket
     AND t.status IN ('open', 'pending', 'waiting', 'in_progress')
     AND EXISTS (
       SELECT 1 FROM public.help_center_pilot_allowlist AS a
        WHERE a.ticket_id = p_ticket
     )
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT 10
$$;

REVOKE ALL ON FUNCTION public.help_center_case_context_thread(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.help_center_case_context_messages(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_case_context_thread(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.help_center_case_context_messages(uuid) TO service_role;
