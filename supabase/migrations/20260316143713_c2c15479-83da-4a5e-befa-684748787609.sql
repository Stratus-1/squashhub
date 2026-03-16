-- Users can only manage their own integration tokens
CREATE POLICY "Users can manage own tokens"
ON public.integrations_tokens
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());