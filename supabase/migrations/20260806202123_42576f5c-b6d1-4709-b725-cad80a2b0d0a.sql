DO $$
DECLARE r record;
BEGIN
  ALTER TABLE public.club_member_fee_payments DISABLE TRIGGER trg_journal_fee_payment_received;

  FOR r IN
    SELECT f.id AS fee_id, m.id AS member_id, f.amount, f.fee_label
    FROM public.club_member_fee_payments f
    JOIN public.club_members m ON m.id = f.club_member_id
    WHERE f.paid = false
      AND m.name IN ('Brad Botha','Craig McLeary','Marelize van der Merwe','Mari Wessels','Nira Chetty','Paul Keanly','Sayyid Habib','Waghied Jappie','Werner Swart','Zaheer Abdhool')
      AND f.fee_label IN ('Family Plan','Single Membership','Club Membership (Family Plan)','Club Membership (Senior (65+, 10yr member))','Club Membership (Single Membership)')
  LOOP
    -- link the existing payment journal pair to this fee (idempotency for future triggers)
    UPDATE public.club_journal_entries j
    SET fee_payment_id = r.fee_id
    WHERE j.club_member_id = r.member_id
      AND j.fee_payment_id IS NULL
      AND j.journal_ref IN (
        SELECT journal_ref FROM public.club_journal_entries
        WHERE club_member_id = r.member_id
          AND account = 'debtors'::public.gl_account
          AND credit = r.amount
          AND fee_payment_id IS NULL
          AND description !~* 'top-up|wallet|auto-settled'
        ORDER BY created_at ASC LIMIT 1
      );

    UPDATE public.club_member_fee_payments
    SET paid = true,
        paid_at = COALESCE(paid_at, (
          SELECT max(created_at) FROM public.club_journal_entries
          WHERE fee_payment_id = r.fee_id AND account='debtors'::public.gl_account AND credit > 0
        ), now())
    WHERE id = r.fee_id;
  END LOOP;

  ALTER TABLE public.club_member_fee_payments ENABLE TRIGGER trg_journal_fee_payment_received;
END $$;