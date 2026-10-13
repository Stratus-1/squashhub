CREATE OR REPLACE FUNCTION public.stamp_sla_signer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NEW.sla_accepted_at IS NOT NULL AND OLD.sla_accepted_at IS DISTINCT FROM NEW.sla_accepted_at THEN
    IF NEW.sla_accepted_by IS NULL AND auth.uid() IS NOT NULL THEN
      NEW.sla_accepted_by := auth.uid();
    END IF;
    IF coalesce(trim(NEW.sla_accepted_name),'') = '' AND NEW.sla_accepted_by IS NOT NULL THEN
      SELECT trim(coalesce(cm.first_name,'')||' '||coalesce(cm.last_name,'')) INTO v_name
      FROM club_members cm WHERE cm.user_id = NEW.sla_accepted_by AND cm.club_id = NEW.id LIMIT 1;
      IF coalesce(v_name,'') = '' THEN
        SELECT email INTO v_name FROM auth.users WHERE id = NEW.sla_accepted_by;
      END IF;
      NEW.sla_accepted_name := v_name;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_sla_signer ON public.clubs;
CREATE TRIGGER trg_stamp_sla_signer BEFORE UPDATE OF sla_accepted_at ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.stamp_sla_signer();