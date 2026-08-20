DROP POLICY IF EXISTS "Support topic access" ON realtime.messages;

CREATE POLICY "Support topic access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = 'rt-support-threads-admin' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  OR realtime.topic() = ('rt-support-threads-' || (auth.uid())::text)
  OR (
    realtime.topic() LIKE 'rt-support-messages-%'
    AND EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = substring(realtime.topic(), 'rt-support-messages-(.*)')
        AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
);
