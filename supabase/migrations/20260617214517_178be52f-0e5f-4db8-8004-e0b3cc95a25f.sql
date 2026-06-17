
DROP FUNCTION IF EXISTS public.generate_member_renewal_invoices(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.generate_member_renewal_invoices(uuid, uuid[], uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.generate_member_renewal_invoices(
  p_club_id uuid,
  p_category_ids uuid[] DEFAULT NULL,
  p_league_assoc_ids uuid[] DEFAULT NULL,
  p_national_body_ids uuid[] DEFAULT NULL
)
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
    -- 1) Membership categories
    SELECT cm.id AS member_id,
           'Renewal Fees ' || extract(year from CURRENT_DATE)::text || ' — ' || mfc.name AS base_label,
           mfc.name AS source_name,
           mfc.annual_fee AS amount,
           COALESCE(mfc.due_month, 3) AS due_month,
           COALESCE(mfc.due_day, 1) AS due_day
    FROM public.club_members cm
    JOIN public.member_fee_categories mfc ON mfc.id = cm.fee_category_id
    WHERE cm.club_id = p_club_id
      AND mfc.annual_fee > 0
      AND mfc.active = true
      AND p_category_ids IS NOT NULL
      AND mfc.id = ANY(p_category_ids)

    UNION ALL

    -- 2) League association fees (only members with active affiliation)
    SELECT cm.id AS member_id,
           'Renewal Fees ' || extract(year from CURRENT_DATE)::text
              || ' — ' || COALESCE(la.abbreviation, la.name) AS base_label,
           COALESCE(la.abbreviation, la.name) AS source_name,
           la.fee_annual AS amount,
           COALESCE(la.fee_due_month, 1) AS due_month,
           COALESCE(la.due_day, 1) AS due_day
    FROM public.league_associations la
    JOIN public.member_association_affiliations maa
      ON maa.association_id = la.id AND maa.active = true
    JOIN public.club_members cm
      ON cm.id = maa.club_member_id AND cm.club_id = p_club_id
    WHERE la.club_id = p_club_id
      AND la.active = true
      AND COALESCE(la.fee_annual, 0) > 0
      AND p_league_assoc_ids IS NOT NULL
      AND la.id = ANY(p_league_assoc_ids)

    UNION ALL

    -- 3) National body fees (only members with at least one active
    --    league registration number in this club)
    SELECT cm.id AS member_id,
           'Renewal Fees ' || extract(year from CURRENT_DATE)::text
              || ' — ' || COALESCE(nbf.abbreviation, nbf.body_name) AS base_label,
           COALESCE(nbf.abbreviation, nbf.body_name) AS source_name,
           nbf.fee_annual AS amount,
           COALESCE(nbf.fee_due_month, 1) AS due_month,
           COALESCE(nbf.due_day, 1) AS due_day
    FROM public.national_body_fees nbf
    JOIN public.club_members cm ON cm.club_id = p_club_id
    WHERE nbf.club_id = p_club_id
      AND nbf.active = true
      AND COALESCE(nbf.fee_annual, 0) > 0
      AND p_national_body_ids IS NOT NULL
      AND nbf.id = ANY(p_national_body_ids)
      AND EXISTS (
        SELECT 1 FROM public.member_association_affiliations maa
        JOIN public.league_associations la2 ON la2.id = maa.association_id
        WHERE maa.club_member_id = cm.id
          AND maa.active = true
          AND maa.league_association_number IS NOT NULL
          AND la2.club_id = p_club_id
      )
  LOOP
    v_due := make_date(
      CASE WHEN make_date(extract(year from CURRENT_DATE)::int, r.due_month, r.due_day) > CURRENT_DATE
           THEN extract(year from CURRENT_DATE)::int
           ELSE extract(year from CURRENT_DATE)::int + 1 END,
      r.due_month, r.due_day);
    v_send := v_due - v_reminder_days;
    v_season := extract(year from v_due)::int;

    SELECT * INTO v_existing
    FROM public.club_member_fee_payments
    WHERE club_member_id = r.member_id
      AND fee_type = 'renewal'
      AND fee_label = r.base_label
      AND season_year = v_season
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.paid THEN
        v_skipped_paid := v_skipped_paid + 1;
      ELSIF v_existing.invoice_email_sent_at IS NOT NULL THEN
        v_skipped_sent := v_skipped_sent + 1;
      ELSE
        UPDATE public.club_member_fee_payments
           SET amount = r.amount,
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
        (r.member_id, 'renewal', r.base_label, r.amount, false, v_season,
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

GRANT EXECUTE ON FUNCTION public.generate_member_renewal_invoices(uuid, uuid[], uuid[], uuid[]) TO authenticated, service_role;
