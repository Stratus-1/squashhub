
-- 1. Schema additions
ALTER TABLE public.club_member_fee_payments
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_due_date date,
  ADD COLUMN IF NOT EXISTS invoice_send_date date,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_email_status text;

CREATE INDEX IF NOT EXISTS idx_cmfp_invoice_send_pending
  ON public.club_member_fee_payments (invoice_send_date)
  WHERE invoice_email_status = 'pending' AND paid = false;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS next_invoice_seq integer NOT NULL DEFAULT 1;

-- 2. Generation function
CREATE OR REPLACE FUNCTION public.generate_member_renewal_invoices(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_today date := current_date;
  v_due date;
  v_send date;
  v_lead int;
  v_season int;
  v_label text;
  v_existing RECORD;
  v_seq int;
  v_inv text;
  v_created int := 0;
  v_updated int := 0;
  v_skipped_paid int := 0;
  v_skipped_sent int := 0;
  v_prefix text;
BEGIN
  SELECT COALESCE(fee_reminder_days_before, 14),
         COALESCE(NULLIF(upper(subdomain), ''), 'INV')
    INTO v_lead, v_prefix
    FROM public.clubs WHERE id = p_club_id;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Club not found: %', p_club_id;
  END IF;

  FOR r IN
    SELECT cm.id AS member_id, cm.fee_category_id,
           fc.name AS category_name, fc.annual_fee, fc.due_month, fc.due_day, fc.active AS cat_active
      FROM public.club_members cm
      JOIN public.member_fee_categories fc ON fc.id = cm.fee_category_id
     WHERE cm.club_id = p_club_id
       AND COALESCE(cm.status, 'active') = 'active'
       AND fc.active = true
       AND fc.annual_fee > 0
  LOOP
    -- next due date (this year or next)
    v_due := make_date(EXTRACT(year FROM v_today)::int, r.due_month, LEAST(r.due_day, 28));
    IF v_due <= v_today THEN
      v_due := make_date(EXTRACT(year FROM v_today)::int + 1, r.due_month, LEAST(r.due_day, 28));
    END IF;
    v_send := v_due - v_lead;
    v_season := EXTRACT(year FROM v_due)::int;
    v_label := 'Renewal Fees ' || v_season || ' — ' || r.category_name;

    SELECT * INTO v_existing
      FROM public.club_member_fee_payments
     WHERE club_member_id = r.member_id
       AND fee_type = 'renewal'
       AND season_year = v_season
     LIMIT 1;

    IF FOUND THEN
      IF v_existing.paid THEN
        v_skipped_paid := v_skipped_paid + 1;
      ELSIF v_existing.invoice_email_sent_at IS NOT NULL THEN
        v_skipped_sent := v_skipped_sent + 1;
      ELSE
        UPDATE public.club_member_fee_payments
           SET amount = r.annual_fee,
               fee_label = v_label,
               invoice_due_date = v_due,
               invoice_send_date = v_send,
               updated_at = now()
         WHERE id = v_existing.id;
        v_updated := v_updated + 1;
      END IF;
    ELSE
      UPDATE public.clubs
         SET next_invoice_seq = next_invoice_seq + 1
       WHERE id = p_club_id
       RETURNING next_invoice_seq - 1 INTO v_seq;
      v_inv := v_prefix || '-' || v_season || '-' || lpad(v_seq::text, 5, '0');

      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, season_year,
         invoice_number, invoice_issued_at, invoice_due_date, invoice_send_date, invoice_email_status)
      VALUES
        (r.member_id, 'renewal', v_label, r.annual_fee, false, v_season,
         v_inv, now(), v_due, v_send, 'pending');
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped_paid', v_skipped_paid,
    'skipped_sent', v_skipped_sent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_member_renewal_invoices(uuid) TO authenticated, service_role;

-- 3. Monthly safety-net: all active clubs
CREATE OR REPLACE FUNCTION public.generate_all_clubs_renewal_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  total_created int := 0;
  total_updated int := 0;
  result jsonb;
BEGIN
  FOR c IN SELECT id FROM public.clubs LOOP
    BEGIN
      result := public.generate_member_renewal_invoices(c.id);
      total_created := total_created + COALESCE((result->>'created')::int, 0);
      total_updated := total_updated + COALESCE((result->>'updated')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      -- swallow per-club failures so one bad club doesn't stop the batch
      NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('created', total_created, 'updated', total_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_all_clubs_renewal_invoices() TO service_role;

-- Schedule: last day of every month at 02:00 (run daily and check date inside)
DO $$
BEGIN
  PERFORM cron.unschedule('renewal-invoices-monthly');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'renewal-invoices-monthly',
  '0 2 28-31 * *',
  $$
  DO $body$
  BEGIN
    IF (CURRENT_DATE + 1)::date - date_trunc('month', CURRENT_DATE + INTERVAL '1 month')::date = 0 THEN
      PERFORM public.generate_all_clubs_renewal_invoices();
    END IF;
  END
  $body$;
  $$
);
