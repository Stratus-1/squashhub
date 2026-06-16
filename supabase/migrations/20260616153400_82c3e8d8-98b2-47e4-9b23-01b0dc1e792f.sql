
CREATE OR REPLACE FUNCTION public.generate_member_renewal_invoices(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_due date;
  v_send date;
  v_season int;
  v_label text;
  v_inv text;
  v_seq int;
  v_prefix text := 'INV';
  v_reminder_days int;
  v_existing record;
  v_created int := 0;
  v_updated int := 0;
  v_skipped_paid int := 0;
  v_skipped_sent int := 0;
BEGIN
  SELECT COALESCE(c.fee_reminder_days_before, 14)
    INTO v_reminder_days
  FROM public.clubs c WHERE c.id = p_club_id;

  FOR r IN
    SELECT cm.id AS member_id, cm.fee_category_id, mfc.name AS cat_name,
           mfc.annual_fee, mfc.due_month, mfc.due_day
    FROM public.club_members cm
    JOIN public.member_fee_categories mfc ON mfc.id = cm.fee_category_id
    WHERE cm.club_id = p_club_id
      AND mfc.annual_fee > 0
  LOOP
    v_due := make_date(
      CASE WHEN make_date(extract(year from CURRENT_DATE)::int, COALESCE(r.due_month,3), COALESCE(r.due_day,1)) > CURRENT_DATE
           THEN extract(year from CURRENT_DATE)::int
           ELSE extract(year from CURRENT_DATE)::int + 1 END,
      COALESCE(r.due_month, 3), COALESCE(r.due_day, 1));
    v_send := v_due - v_reminder_days;
    v_season := extract(year from v_due)::int;
    v_label := 'Renewal Fees ' || v_season || ' — ' || r.cat_name;

    SELECT * INTO v_existing
    FROM public.club_member_fee_payments
    WHERE club_member_id = r.member_id
      AND fee_type = 'renewal'
      AND season_year = v_season
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
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
         SET next_invoice_seq = COALESCE(next_invoice_seq, 1) + 1
       WHERE id = p_club_id
       RETURNING COALESCE(next_invoice_seq, 1) - 1 INTO v_seq;
      v_inv := v_prefix || '-' || v_season || '-' || lpad(v_seq::text, 5, '0');

      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, season_year,
         invoice_number, invoice_due_date, invoice_send_date, invoice_email_status)
      VALUES
        (r.member_id, 'renewal', v_label, r.annual_fee, false, v_season,
         v_inv, v_due, v_send, 'pending');
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
$function$;
