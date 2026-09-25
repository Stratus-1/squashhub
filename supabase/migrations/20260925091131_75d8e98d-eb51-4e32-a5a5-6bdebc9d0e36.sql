ALTER TABLE public.ai_assist_interactions
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS assistant_answer text,
  ADD COLUMN IF NOT EXISTS retry_of uuid REFERENCES public.ai_assist_interactions(id) ON DELETE SET NULL;

UPDATE public.ai_assist_interactions SET conversation_id = id WHERE conversation_id IS NULL;

CREATE OR REPLACE FUNCTION public.ai_interaction_set_conversation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    BEGIN
      NEW.conversation_id := NULLIF(NEW.context->>'conversationId','')::uuid;
    EXCEPTION WHEN others THEN NEW.conversation_id := NULL;
    END;
  END IF;
  IF NEW.retry_of IS NULL AND NEW.context ? 'retryOf' THEN
    BEGIN
      NEW.retry_of := NULLIF(NEW.context->>'retryOf','')::uuid;
    EXCEPTION WHEN others THEN NEW.retry_of := NULL;
    END;
  END IF;
  NEW.conversation_id := COALESCE(NEW.conversation_id, NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ai_interaction_conversation ON public.ai_assist_interactions;
CREATE TRIGGER trg_ai_interaction_conversation BEFORE INSERT ON public.ai_assist_interactions
FOR EACH ROW EXECUTE FUNCTION public.ai_interaction_set_conversation();

CREATE INDEX IF NOT EXISTS ai_assist_interactions_user_conv ON public.ai_assist_interactions (user_id, conversation_id, created_at);

-- Requester-safe bug lifecycle: status only, and only for bugs linked to the caller's own requests.
CREATE OR REPLACE FUNCTION public.my_ai_bug_statuses(_ids uuid[])
RETURNS TABLE (id uuid, status text, verification text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.status, b.verification
  FROM public.ai_bug_reports b
  WHERE b.id = ANY(_ids)
    AND EXISTS (SELECT 1 FROM public.ai_assist_interactions i WHERE i.bug_report_id = b.id AND i.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.my_ai_bug_statuses(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_bug_statuses(uuid[]) TO authenticated;