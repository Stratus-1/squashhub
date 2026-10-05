CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Alert admins only once the applicant has finished the signup steps
  -- (a fee category is saved) — never at bare account creation.
  IF NEW.is_pending_approval AND NEW.fee_category_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.fee_category_id IS NULL) THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending',
           jsonb_build_object('club_member_id', NEW.id, 'club_id', NEW.club_id)
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.user_id IS NOT NULL
      AND cm.id <> NEW.id
      AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, NEW.club_id, 'members'));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_club_admins_of_application ON public.club_members;
CREATE TRIGGER trg_notify_club_admins_of_application
AFTER INSERT OR UPDATE OF fee_category_id ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.notify_club_admins_of_application();