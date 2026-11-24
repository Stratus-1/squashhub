CREATE OR REPLACE FUNCTION public.guard_banking_only_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j jsonb; oldj jsonb; cid uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN NEW; END IF;
  j := to_jsonb(NEW); oldj := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  IF TG_TABLE_NAME='clubs' THEN
    cid := NEW.id;
    IF public.is_club_admin_or_permitted(auth.uid(),cid,'club') THEN RETURN NEW; END IF;
  ELSE
    cid := (j->>'club_id')::uuid;
    IF public.is_club_secrets_admin(auth.uid(),cid) THEN RETURN NEW; END IF;
  END IF;
  -- Without banking permission RLS gives no direct write path, so the change comes from a trusted server function.
  IF NOT public.is_club_admin_or_permitted(auth.uid(),cid,'banking') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(j) e
             WHERE e.value IS DISTINCT FROM oldj->e.key
               AND e.key NOT IN ('id','club_id','created_at','updated_at','bar_card_provider',
                                 'bar_orders_open_until','bar_orders_opened_by','bar_order_process_enabled','member_number_prefix')
               AND e.key !~ '(bank|payment|gateway|accepted_payment)') THEN
    RAISE EXCEPTION 'Banking permission only allows bank and payment gateway changes' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;