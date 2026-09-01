-- Harden audit_events INSERT path
-- 1. Revoke direct INSERT from authenticated users.
REVOKE INSERT ON public.audit_events FROM authenticated;

-- 2. Drop the overly permissive INSERT policy.
DROP POLICY IF EXISTS "Authenticated users write audit events" ON public.audit_events;

-- 3. Create a restrictive INSERT policy for service_role only.
-- Edge Functions and other trusted backend paths use service_role.
CREATE POLICY "Service role writes audit events"
  ON public.audit_events FOR INSERT TO service_role
  WITH CHECK (true);

-- Ensure service_role retains full access.
GRANT ALL ON public.audit_events TO service_role;