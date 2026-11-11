-- Club C: payer P pays owner O's fee F1 (R100, GL-booked on O). P also pays
-- a R0 fee F0 for O and a fee FX for a member of another club.
insert into clubs(id) values ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into club_members values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000c','Pat Payer'),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000c','Olive Owner'),
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000d','Other Club');
insert into club_member_fee_payments(id, club_member_id, paid_by_member_id, amount, paid, fee_type, fee_label, created_at) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',100,false,'membership','Junior 2026','2026-02-01'),
 ('00000000-0000-0000-0000-0000000000f0','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',0,false,'membership','Zero fee','2026-02-02'),
 ('00000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1',75,false,'membership','Other club fee','2026-02-03');
insert into club_journal_entries(id, club_id, club_member_id, account, debit, credit, description, created_at, fee_payment_id) values
 -- Owner: F1 posted on her account (must be excluded), plus her own bar charge R50.
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000b1','debtors',100,0,'Fee raised: Junior 2026','2026-02-01','00000000-0000-0000-0000-0000000000f1'),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000b1','debtors',50,0,'Bar','2026-01-15',null),
 -- Payer: R30 payment before the family fee and R20 charge after it.
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000a1','debtors',0,30,'Payment','2026-01-10',null),
 ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000a1','debtors',20,0,'Bar','2026-03-01',null);

DO $$
DECLARE o jsonb; p jsonb; s jsonb; ids text[];
BEGIN
  o := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000b1');
  p := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000a1');

  -- 1. Owner: own fee billed to the payer is excluded from totals and statement.
  ASSERT (o->>'outstanding')::numeric = 50, 'owner outstanding ' || (o->>'outstanding');
  ASSERT (o->>'totalBilled')::numeric = 50, 'owner billed ' || (o->>'totalBilled');
  ASSERT jsonb_array_length(o->'statement') = 1, 'owner statement rows';
  ASSERT (o->'statement'->0->>'id') = '00000000-0000-0000-0000-000000000102', 'owner kept row';
  ASSERT jsonb_array_length(o->'fees') = 0, 'owner fees exclude billed-elsewhere';

  -- 2. Payer: one synthetic family-fee row, deterministic id, web description.
  s := p->'statement';
  SELECT array_agg(e->>'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(s) WITH ORDINALITY t(e, ord);
  ASSERT ids = ARRAY['00000000-0000-0000-0000-000000000202','family-fee-00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000201'], 'payer order ' || ids::text;
  ASSERT (SELECT count(*) FROM jsonb_array_elements(s) e WHERE e->>'id' LIKE 'family-fee-%') = 1, 'one family row (R0 and other-club excluded)';
  ASSERT s->1->>'description' = 'Fee raised: Olive Owner — Junior 2026', 'description ' || (s->1->>'description');
  ASSERT (s->1->>'debit')::numeric = 100 AND (s->1->>'credit')::numeric = 0, 'family debit';
  ASSERT (s->1->>'date')::timestamptz = '2026-02-01'::timestamptz, 'family date = created_at';

  -- 3. One chronological running balance: -30, +100 => 70, +20 => 90.
  ASSERT (s->2->>'balance')::numeric = -30, 'bal1';
  ASSERT (s->1->>'balance')::numeric = 70, 'bal2';
  ASSERT (s->0->>'balance')::numeric = 90, 'bal3';
  ASSERT (p->>'outstanding')::numeric = 90, 'payer outstanding ' || (p->>'outstanding');
  ASSERT (p->>'outstanding')::numeric = (s->0->>'balance')::numeric, 'outstanding = final balance';

  -- 4. payerFees fallback unchanged (club-scoped, includes R0 fee, has createdAt).
  ASSERT jsonb_array_length(p->'payerFees') = 2, 'payerFees count';
  ASSERT (SELECT bool_and(e ? 'createdAt') FROM jsonb_array_elements(p->'payerFees') e), 'createdAt';

  -- 5. Response keys unchanged.
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) = ARRAY['bookingShortfall','canPlay','clubId','currencyCode','currencySymbol','fees','hasMonthlyMandate','memberCreditBalance','memberId','minimumPlayBalance','outstanding','payerFees','paymentMethods','paymentSetup','planAllowedDebt','playableBalance','statement','status','totalBilled','totalPaid','unpaidFeesTotal'], 'keys';

  -- 6. Secret and club scope.
  BEGIN
    PERFORM public.mobile_member_finance_payload('bad','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000a1');
    RAISE EXCEPTION 'bad secret accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'Unauthorized', 'secret: ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000a1');
    RAISE EXCEPTION 'cross-club accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'Member not found for club', 'club: ' || SQLERRM;
  END;
END $$;
