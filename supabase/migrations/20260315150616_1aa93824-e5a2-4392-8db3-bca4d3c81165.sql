
-- Fix INSERT policy to be more specific
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR club_member_id IS NOT NULL);

-- Make user_id nullable since member-only notifications resolve it via trigger
ALTER TABLE public.notifications ALTER COLUMN user_id DROP NOT NULL;
