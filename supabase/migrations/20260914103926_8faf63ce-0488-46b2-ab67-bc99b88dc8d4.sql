CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_pending_approval THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT cm.user_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending',
           jsonb_build_object('club_member_id', NEW.id, 'club_id', NEW.club_id)
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.role = 'admin'
      AND cm.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_membership_application_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_pending_approval, false) AND NOT COALESCE(NEW.is_pending_approval, false) THEN
    UPDATE public.notifications
       SET read = true
     WHERE type = 'membership_application'
       AND read = false
       AND data->>'club_member_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_membership_application_notifications ON public.club_members;
CREATE TRIGGER trg_clear_membership_application_notifications
AFTER UPDATE OF is_pending_approval ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.clear_membership_application_notifications();

-- Clear stale alerts: no applicant is pending in the admin's club any more
UPDATE public.notifications n
   SET read = true
 WHERE n.type = 'membership_application'
   AND n.read = false
   AND NOT EXISTS (
     SELECT 1
     FROM public.club_members admin_cm
     JOIN public.club_members pending_cm ON pending_cm.club_id = admin_cm.club_id
     WHERE admin_cm.user_id = n.user_id
       AND admin_cm.role = 'admin'
       AND pending_cm.is_pending_approval = true
   );