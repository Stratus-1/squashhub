-- Allow authenticated users to insert their own light sessions (for fallback/dev mode)
CREATE POLICY "Users can insert own light sessions"
ON public.light_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);