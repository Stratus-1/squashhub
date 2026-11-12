-- Card Lights top-ups expire after 24 hours unpaid: a later card payment must never
-- release an old, abandoned checkout. EFT behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.gobook_lights_mark_ready_from_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_avail numeric;
BEGIN
  IF NEW.status <> 'confirmed' OR NEW.club_member_id IS NULL
     OR NEW.type NOT IN ('topup','debit') OR COALESCE(NEW.method,'') NOT IN ('card','eft')
     OR (TG_OP = 'UPDATE' AND OLD.status = 'confirmed') THEN
    RETURN NEW;
  END IF;
  v_avail := abs(NEW.amount);
  FOR r IN SELECT id, amount FROM gobook_lights_topups
            WHERE club_member_id = NEW.club_member_id AND status = 'awaiting_payment'
              AND created_at <= COALESCE(NEW.confirmed_at, now())
              AND (method <> 'card' OR created_at >= COALESCE(NEW.confirmed_at, now()) - interval '24 hours')
            ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    EXIT WHEN v_avail < r.amount;
    UPDATE gobook_lights_topups SET status = 'ready', updated_at = now() WHERE id = r.id;
    v_avail := v_avail - r.amount;
  END LOOP;
  RETURN NEW;
END $function$;