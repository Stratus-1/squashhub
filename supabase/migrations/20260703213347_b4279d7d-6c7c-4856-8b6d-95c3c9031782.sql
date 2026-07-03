
CREATE OR REPLACE FUNCTION public.enforce_member_suspension_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.member_suspension_status;
  v_manual boolean;
  v_reason text;
  v_blocks jsonb;
  v_enabled boolean;
BEGIN
  -- Only guard member-originated bookings
  IF NEW.club_member_id IS NULL OR NEW.source <> 'squashhub' THEN
    RETURN NEW;
  END IF;

  SELECT cm.suspension_status, cm.suspension_manual, cm.suspension_reason,
         c.suspension_rules->'blocks', COALESCE((c.suspension_rules->>'enabled')::boolean, false)
    INTO v_status, v_manual, v_reason, v_blocks, v_enabled
    FROM public.club_members cm
    JOIN public.clubs c ON c.id = cm.club_id
   WHERE cm.id = NEW.club_member_id;

  IF v_blocks IS NULL OR NOT (v_blocks ? 'bookings') THEN
    RETURN NEW;
  END IF;

  -- Manual holds always enforced; auto-status only if rules enabled
  IF (v_manual AND v_status IN ('suspended','manual_hold'))
     OR (v_enabled AND v_status = 'suspended') THEN
    RAISE EXCEPTION 'Account suspended for arrears — settle outstanding fees to make bookings (%)', COALESCE(v_reason, 'contact your club admin');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_suspension_bookings ON public.bookings;
CREATE TRIGGER trg_enforce_suspension_bookings
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_suspension_on_booking();
