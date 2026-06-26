
CREATE OR REPLACE VIEW public.v_ledger_reconciliation
WITH (security_invoker=on) AS
WITH gl_invoices AS (
  SELECT je.club_id, je.club_member_id, je.fee_payment_id,
         fp.invoice_number, sum(je.debit) AS gl_amount
  FROM club_journal_entries je
  JOIN club_member_fee_payments fp ON fp.id = je.fee_payment_id
  WHERE je.account = 'debtors'::gl_account
  GROUP BY je.club_id, je.club_member_id, je.fee_payment_id, fp.invoice_number
),
sub_invoices AS (
  SELECT mct.club_id, mct.club_member_id, fp.id AS fee_payment_id,
         mct.reference AS invoice_number, sum(mct.amount) AS sub_amount
  FROM member_credit_transactions mct
  LEFT JOIN club_member_fee_payments fp
    ON fp.club_member_id = mct.club_member_id
   AND (fp.invoice_number = mct.reference OR (fp.invoice_number IS NULL AND mct.reference IS NULL AND fp.amount = mct.amount))
  WHERE mct.type = 'debit' AND mct.method = 'invoice'
  GROUP BY mct.club_id, mct.club_member_id, fp.id, mct.reference
)
SELECT COALESCE(g.club_id, s.club_id) AS club_id,
       COALESCE(g.club_member_id, s.club_member_id) AS club_member_id,
       COALESCE(g.invoice_number, s.invoice_number) AS invoice_number,
       COALESCE(g.fee_payment_id, s.fee_payment_id) AS fee_payment_id,
       COALESCE(g.gl_amount, 0) AS gl_amount,
       COALESCE(s.sub_amount, 0) AS sub_amount,
       CASE
         WHEN g.fee_payment_id IS NULL THEN 'missing_in_gl'
         WHEN s.fee_payment_id IS NULL THEN 'missing_in_sub_ledger'
         WHEN round(COALESCE(g.gl_amount,0),2) <> round(COALESCE(s.sub_amount,0),2) THEN 'amount_mismatch'
         ELSE 'ok'
       END AS status
FROM gl_invoices g
FULL JOIN sub_invoices s
  ON s.fee_payment_id = g.fee_payment_id;

GRANT SELECT ON public.v_ledger_reconciliation TO authenticated;
