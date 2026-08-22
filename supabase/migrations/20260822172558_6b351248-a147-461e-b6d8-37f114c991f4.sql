CREATE OR REPLACE FUNCTION public.email_send_log_inherit_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NULL AND NEW.message_id IS NOT NULL THEN
    SELECT l.club_id INTO NEW.club_id
    FROM public.email_send_log l
    WHERE l.message_id = NEW.message_id AND l.club_id IS NOT NULL
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_send_log_inherit_club ON public.email_send_log;
CREATE TRIGGER trg_email_send_log_inherit_club
BEFORE INSERT ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.email_send_log_inherit_club();

UPDATE public.email_send_log l
SET club_id = src.club_id
FROM (
  SELECT DISTINCT ON (message_id) message_id, club_id
  FROM public.email_send_log
  WHERE club_id IS NOT NULL AND message_id IS NOT NULL
  ORDER BY message_id, created_at DESC
) src
WHERE l.club_id IS NULL AND l.message_id = src.message_id;