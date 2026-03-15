
-- Fix overly permissive INSERT policy on notifications table
-- Notifications are inserted by SECURITY DEFINER triggers, not directly by users.
-- Restrict to platform admins only (for manual/marketing notifications).
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Admins can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
