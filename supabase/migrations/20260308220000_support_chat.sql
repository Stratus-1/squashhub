-- Support chat (user <-> admin) + admin inbox
-- - support_threads: per-user tickets/conversations
-- - support_messages: message stream per thread
-- - notifications: notify admins on user message; notify user on admin message
-- - realtime: add tables to supabase_realtime publication if present

-- 1) Threads
CREATE TABLE IF NOT EXISTS public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_by uuid,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_threads_user_idx ON public.support_threads(user_id);
CREATE INDEX IF NOT EXISTS support_threads_status_idx ON public.support_threads(status);
CREATE INDEX IF NOT EXISTS support_threads_last_message_idx ON public.support_threads(last_message_at DESC NULLS LAST, created_at DESC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

-- 2) Messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON public.support_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_sender_idx ON public.support_messages(sender_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 3) Updated_at trigger
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_support_threads_updated_at ON public.support_threads;
    CREATE TRIGGER update_support_threads_updated_at
      BEFORE UPDATE ON public.support_threads
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) RLS policies
DO $$
BEGIN
  -- Threads
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_threads' AND policyname = 'Support threads viewable by owner'
  ) THEN
    CREATE POLICY "Support threads viewable by owner"
      ON public.support_threads FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_threads' AND policyname = 'Support threads insert by owner'
  ) THEN
    CREATE POLICY "Support threads insert by owner"
      ON public.support_threads FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_threads' AND policyname = 'Support threads update by owner'
  ) THEN
    CREATE POLICY "Support threads update by owner"
      ON public.support_threads FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_threads' AND policyname = 'Admins can manage support threads'
  ) THEN
    CREATE POLICY "Admins can manage support threads"
      ON public.support_threads FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  -- Messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_messages' AND policyname = 'Support messages viewable by participants'
  ) THEN
    CREATE POLICY "Support messages viewable by participants"
      ON public.support_messages FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.support_threads t
          WHERE t.id = thread_id
            AND (t.user_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_messages' AND policyname = 'Support messages insert by participants'
  ) THEN
    CREATE POLICY "Support messages insert by participants"
      ON public.support_messages FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
          SELECT 1 FROM public.support_threads t
          WHERE t.id = thread_id
            AND (t.user_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
        )
      );
  END IF;
END $$;

-- 5) Trigger: keep thread last_message_* in sync
CREATE OR REPLACE FUNCTION public.support_apply_message_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview text;
  sender_is_staff boolean;
BEGIN
  preview := regexp_replace(NEW.body, '\s+', ' ', 'g');
  IF char_length(preview) > 140 THEN
    preview := substring(preview from 1 for 140) || '…';
  END IF;

  sender_is_staff := public.is_admin_or_moderator(NEW.sender_id);

  UPDATE public.support_threads
  SET
    last_message_at = NEW.created_at,
    last_message_by = NEW.sender_id,
    last_message_preview = preview,
    status = CASE
      WHEN status = 'closed' THEN 'closed'
      WHEN sender_is_staff THEN 'pending'
      ELSE 'open'
    END,
    updated_at = now()
  WHERE id = NEW.thread_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_apply_message_effects_trigger ON public.support_messages;
CREATE TRIGGER support_apply_message_effects_trigger
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_apply_message_effects();

-- 6) Trigger: notifications for support messages
CREATE OR REPLACE FUNCTION public.notify_on_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread_owner uuid;
  sender_is_staff boolean;
  sender_name text;
  thread_subject text;
  admin_id uuid;
BEGIN
  SELECT user_id, subject INTO thread_owner, thread_subject
  FROM public.support_threads
  WHERE id = NEW.thread_id;

  sender_is_staff := public.is_admin_or_moderator(NEW.sender_id);
  SELECT name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;

  IF sender_is_staff THEN
    -- Notify thread owner
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      thread_owner,
      'Support reply',
      COALESCE(sender_name, 'Support') || ': ' || COALESCE(thread_subject, 'Support'),
      'support'
    );
  ELSE
    -- Notify all admins/moderators
    FOR admin_id IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role)
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        admin_id,
        'New support message',
        COALESCE(sender_name, 'A user') || ': ' || COALESCE(thread_subject, 'Support'),
        'support'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_support_message_trigger ON public.support_messages;
CREATE TRIGGER notify_on_support_message_trigger
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_support_message();

-- 7) Realtime enablement
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_threads') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
    END IF;
  END IF;
END $$;

