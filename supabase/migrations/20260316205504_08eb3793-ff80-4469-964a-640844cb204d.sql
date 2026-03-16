-- Support threads table
CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'Support',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  last_message_at timestamptz,
  last_message_by uuid,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own threads" ON public.support_threads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own threads" ON public.support_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own threads" ON public.support_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all threads" ON public.support_threads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all threads" ON public.support_threads
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Support messages table
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants can view messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Thread participants can send messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Auto-update thread metadata on new message
CREATE OR REPLACE FUNCTION public.update_support_thread_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_threads
  SET last_message_at = NEW.created_at,
      last_message_by = NEW.sender_id,
      last_message_preview = left(NEW.body, 200),
      updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_support_thread_on_message
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_support_thread_on_message();

-- Enable realtime for support
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Notify super admin on new support thread
CREATE OR REPLACE FUNCTION public.notify_super_admin_on_support_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  user_name text;
  user_email text;
BEGIN
  SELECT name, email INTO user_name, user_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  FOR r IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      r.user_id,
      'New support request',
      COALESCE(user_name, 'A user') || ' (' || COALESCE(user_email, 'no email') || ') opened: "' || COALESCE(NEW.subject, 'Support') || '"',
      'admin',
      '/admin/support',
      jsonb_build_object('thread_id', NEW.id, 'user_id', NEW.user_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_super_admin_on_support_thread
AFTER INSERT ON public.support_threads
FOR EACH ROW
EXECUTE FUNCTION public.notify_super_admin_on_support_thread();