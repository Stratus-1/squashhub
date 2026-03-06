-- Tighten integrations RLS: users can view own integration metadata,
-- but only edge functions (service role) can create/update/delete.

DROP POLICY IF EXISTS "Users can manage own integrations" ON public.integrations_accounts;
DROP POLICY IF EXISTS "Users can update own integrations" ON public.integrations_accounts;

