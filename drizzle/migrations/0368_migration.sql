CREATE TABLE public.gobook_lights_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id),
  gobook_client_id bigint NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 10000),
  method text NOT NULL CHECK (method IN ('card','eft','account')),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','ready','submitting','submitted','posted','cancelled','failed','abandoned')),
  reference text NOT NULL UNIQUE,
  gobook_payment_id bigint,
  gobook_status text,
  cancellation_reason text,
  last_error text,
  transfer_journal_ref uuid,
  reversal_journal_ref uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.gobook_lights_topups (club_member_id, status);
GRANT SELECT ON public.gobook_lights_topups TO authenticated;
GRANT ALL ON public.gobook_lights_topups TO service_role;
ALTER TABLE public.gobook_lights_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or club finance can view lights top-ups" ON public.gobook_lights_topups FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_id AND m.user_id = auth.uid())
  OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
);

-- Money reaching the member's account after a card/EFT lights request marks it ready to send.
CREATE OR REPLACE FUNCTION public.gobook_lights_mark_ready() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_avail numeric;
BEGIN
  IF NEW.account <> 'debtors' OR NEW.credit <= 0 OR NEW.club_member_id IS NULL OR NEW.reverses_journal_ref IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_avail := NEW.credit;
  FOR r IN SELECT id, amount FROM gobook_lights_topups
            WHERE club_member_id = NEW.club_member_id AND status = 'awaiting_payment'
              AND method IN ('card','eft') AND created_at <= NEW.created_at
            ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    EXIT WHEN v_avail < r.amount;
    UPDATE gobook_lights_topups SET status = 'ready', updated_at = now() WHERE id = r.id;
    v_avail := v_avail - r.amount;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gobook_lights_mark_ready() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_gobook_lights_mark_ready AFTER INSERT ON public.club_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.gobook_lights_mark_ready();

-- Wake the sender as soon as a top-up becomes ready (no polling).
CREATE OR REPLACE FUNCTION public.gobook_lights_wake() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ready' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ready') THEN
    PERFORM net.http_post(
      url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/gobook-lights-topup',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('action','process'));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gobook_lights_wake() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_gobook_lights_wake AFTER INSERT OR UPDATE OF status ON public.gobook_lights_topups
FOR EACH ROW EXECUTE FUNCTION public.gobook_lights_wake();

-- Hourly backstop: confirm GoBook posted/cancelled status and retry any missed sends.
SELECT cron.schedule('gobook-lights-topups-hourly', '23 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/gobook-lights-topup',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('action','process'))
  WHERE EXISTS (SELECT 1 FROM public.gobook_lights_topups WHERE status IN ('ready','submitting','submitted'));
$cron$);