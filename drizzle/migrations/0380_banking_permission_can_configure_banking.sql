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
  -- Banking-only users: may change only banking/payment columns
  IF EXISTS (SELECT 1 FROM jsonb_each(j) e
             WHERE e.value IS DISTINCT FROM oldj->e.key
               AND e.key NOT IN ('id','club_id','created_at','updated_at')
               AND e.key !~ '(bank|payment|gateway|accepted_payment)') THEN
    RAISE EXCEPTION 'Banking permission only allows bank and payment gateway changes' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS banking_only_write ON public.clubs;
CREATE TRIGGER banking_only_write BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.guard_banking_only_write();
DROP TRIGGER IF EXISTS banking_only_write ON public.club_secrets;
CREATE TRIGGER banking_only_write BEFORE INSERT OR UPDATE ON public.club_secrets FOR EACH ROW EXECUTE FUNCTION public.guard_banking_only_write();

CREATE POLICY "Banking permitted can update banking" ON public.clubs FOR UPDATE TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), id, 'banking'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), id, 'banking'));
CREATE POLICY "Banking permitted can select secrets" ON public.club_secrets FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'));
CREATE POLICY "Banking permitted can insert secrets" ON public.club_secrets FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'));
CREATE POLICY "Banking permitted can update secrets" ON public.club_secrets FOR UPDATE TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'));