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
-- 0397: a PAID R60 family fee F2 that P paid for O. Display-only in payerFees.
insert into club_member_fee_payments(id, club_member_id, paid_by_member_id, amount, paid, paid_at, fee_type, fee_label, created_at) values
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',60,true,'2026-02-15','membership','Junior 2025','2026-02-10');
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

  -- 4. payerFees: club-scoped, includes R0 fee and (0397) the paid fee once, has createdAt.
  ASSERT jsonb_array_length(p->'payerFees') = 3, 'payerFees count ' || jsonb_array_length(p->'payerFees');
  ASSERT (SELECT bool_and(e ? 'createdAt') FROM jsonb_array_elements(p->'payerFees') e), 'createdAt';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(p->'payerFees') e WHERE e->>'id' = '00000000-0000-0000-0000-0000000000f2') = 1, 'paid fee listed once';
  ASSERT (SELECT (e->>'paid')::boolean AND (e->>'paidAt')::timestamptz = '2026-02-15'::timestamptz AND e->>'method' = 'Recorded by club'
          FROM jsonb_array_elements(p->'payerFees') e WHERE e->>'id' = '00000000-0000-0000-0000-0000000000f2'), 'paid fee paid/paidAt/method';
  ASSERT (SELECT bool_and(e->>'method' = 'Not paid yet' AND NOT (e->>'paid')::boolean)
          FROM jsonb_array_elements(p->'payerFees') e WHERE e->>'id' <> '00000000-0000-0000-0000-0000000000f2'), 'unpaid rows say Not paid yet';
  -- 4b. Paid family fee does not touch totals, eligibility or statement.
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s) e WHERE e->>'id' = 'family-fee-00000000-0000-0000-0000-0000000000f2'), 'no statement row for paid fee';
  ASSERT (p->>'unpaidFeesTotal')::numeric = 100, 'unpaidFeesTotal ' || (p->>'unpaidFeesTotal');
  ASSERT (p->>'planAllowedDebt')::numeric = 100, 'planAllowedDebt ' || (p->>'planAllowedDebt');
  ASSERT (p->>'bookingShortfall')::numeric = 10, 'bookingShortfall ' || (p->>'bookingShortfall');
  ASSERT (p->>'totalBilled')::numeric = 120, 'totalBilled ' || (p->>'totalBilled');

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

-- 0398: own unpaid fees with no linked member GL row.
-- Uma (u1): unlinked own fee U1 R40, linked own fee L1 R25 (GL-posted), a paid
-- unlinked fee UP, a R0 unlinked fee U0, and an income-only GL line for U1
-- (not a debtors/member_credits link). Oscar (o2) owns unlinked fee F3 R35
-- that Penny (p2) is recorded as paying.
insert into club_members values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000c','Uma Unposted'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000000c','Oscar Owner'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-00000000000c','Penny Payer');
insert into club_member_fee_payments(id, club_member_id, paid_by_member_id, amount, paid, paid_at, fee_type, fee_label, created_at) values
 ('00000000-0000-0000-0000-0000000001a1','00000000-0000-0000-0000-0000000000c1',null,40,false,null,'renewal','Renewal 2027','2026-01-20'),
 ('00000000-0000-0000-0000-0000000001a2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1',25,false,null,'membership','Posted fee','2026-01-25'),
 ('00000000-0000-0000-0000-0000000001a3','00000000-0000-0000-0000-0000000000c1',null,70,true,'2026-01-30','membership','Paid fee','2026-01-22'),
 ('00000000-0000-0000-0000-0000000001a4','00000000-0000-0000-0000-0000000000c1',null,0,false,null,'membership','Zero own','2026-01-23'),
 ('00000000-0000-0000-0000-0000000001a5','00000000-0000-0000-0000-0000000000c1',null,90,false,null,'club_payable_assoc','Club payable','2026-01-24'),
 ('00000000-0000-0000-0000-0000000001b1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3',35,false,null,'membership','Family 2027','2026-01-21');
insert into club_journal_entries(id, club_id, club_member_id, account, debit, credit, description, created_at, fee_payment_id) values
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1','debtors',0,10,'Payment','2026-01-05',null),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1','debtors',25,0,'Fee raised: Posted fee','2026-01-25','00000000-0000-0000-0000-0000000001a2'),
 ('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1','membership_income',0,40,'Income only','2026-01-20','00000000-0000-0000-0000-0000000001a1');

DO $$
DECLARE u jsonb; o jsonb; p jsonb; s jsonb; ids text[];
BEGIN
  u := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c1');
  s := u->'statement';
  SELECT array_agg(e->>'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(s) WITH ORDINALITY t(e, ord);
  -- (a) Unlinked own unpaid fee appears once and moves outstanding/statement once.
  ASSERT ids = ARRAY['00000000-0000-0000-0000-000000000302','fee-00000000-0000-0000-0000-0000000001a1','00000000-0000-0000-0000-000000000301'], 'uma order ' || COALESCE(ids::text, 'null');
  ASSERT (SELECT count(*) FROM jsonb_array_elements(s) e WHERE e->>'id' LIKE 'fee-%') = 1, 'one own unposted row';
  ASSERT s->1->>'description' = 'Fee raised: Renewal 2027', 'own description ' || (s->1->>'description');
  ASSERT s->1->>'account' = 'debtors', 'own account';
  ASSERT (s->1->>'debit')::numeric = 40 AND (s->1->>'credit')::numeric = 0, 'own debit';
  ASSERT (s->1->>'date')::timestamptz = '2026-01-20'::timestamptz, 'own date = created_at';
  ASSERT (s->2->>'balance')::numeric = -10 AND (s->1->>'balance')::numeric = 30 AND (s->0->>'balance')::numeric = 55, 'uma balances';
  ASSERT (u->>'outstanding')::numeric = 55, 'uma outstanding ' || (u->>'outstanding');
  ASSERT (u->>'outstanding')::numeric = (s->0->>'balance')::numeric, 'uma outstanding = final balance';
  ASSERT (u->>'totalBilled')::numeric = 65, 'uma billed ' || (u->>'totalBilled');
  ASSERT (u->>'totalPaid')::numeric = 10, 'uma paid ' || (u->>'totalPaid');
  ASSERT (u->>'memberCreditBalance')::numeric = 0, 'uma credit';
  ASSERT (u->>'unpaidFeesTotal')::numeric = 65, 'uma unpaidFeesTotal ' || (u->>'unpaidFeesTotal');
  -- (b) Linked own fee is represented only by its GL row; paid, R0 and club-payable fees not synthesized.
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s) e WHERE e->>'id' IN (
    'fee-00000000-0000-0000-0000-0000000001a2','fee-00000000-0000-0000-0000-0000000001a3',
    'fee-00000000-0000-0000-0000-0000000001a4','fee-00000000-0000-0000-0000-0000000001a5')), 'no synthetic for linked/paid/R0/payable';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(s) e WHERE (e->>'debit')::numeric = 25) = 1, 'linked fee once';

  -- (c) Fee paid by another member stays off the owner; payer sees it once as a family fee.
  o := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c2');
  ASSERT jsonb_array_length(o->'statement') = 0, 'oscar statement ' || (o->'statement')::text;
  ASSERT (o->>'outstanding')::numeric = 0 AND (o->>'totalBilled')::numeric = 0, 'oscar totals';
  p := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c3');
  ASSERT jsonb_array_length(p->'statement') = 1, 'penny statement rows';
  ASSERT p->'statement'->0->>'id' = 'family-fee-00000000-0000-0000-0000-0000000001b1', 'penny family row';
  ASSERT (p->>'outstanding')::numeric = 35 AND (p->>'totalBilled')::numeric = 35, 'penny totals';
END $$;

-- 0398 posting rule (journal_fee_assessment): Vera (v1) has an unissued
-- future-due draft D1 R500 (excluded), an unissued past-due fee D2 R7 and an
-- issued future-due fee D3 R3 (both included).
insert into club_members values
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-00000000000c','Vera Drafts');
insert into club_member_fee_payments(id, club_member_id, paid_by_member_id, amount, paid, fee_type, fee_label, invoice_due_date, invoice_issued_at, created_at) values
 ('00000000-0000-0000-0000-0000000001d1','00000000-0000-0000-0000-0000000000c4',null,500,false,'renewal','Renewal 2099 draft',current_date + 30,null,'2026-01-10'),
 ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000c4',null,7,false,'tournament_entry','Past due','2020-01-01',null,'2026-01-11'),
 ('00000000-0000-0000-0000-0000000001d3','00000000-0000-0000-0000-0000000000c4',null,3,false,'renewal','Issued future',current_date + 30,'2026-01-12','2026-01-12');

DO $$
DECLARE v jsonb; ids text[];
BEGIN
  v := public.mobile_member_finance_payload('ok','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000c4');
  SELECT array_agg(e->>'id' ORDER BY ord) INTO ids FROM jsonb_array_elements(v->'statement') WITH ORDINALITY t(e, ord);
  ASSERT ids = ARRAY['fee-00000000-0000-0000-0000-0000000001d3','fee-00000000-0000-0000-0000-0000000001d2'], 'vera rows ' || COALESCE(ids::text, 'null');
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'statement') e WHERE e->>'id' = 'fee-00000000-0000-0000-0000-0000000001d1'), 'future-due draft excluded';
  ASSERT (v->>'outstanding')::numeric = 10 AND (v->>'totalBilled')::numeric = 10, 'vera totals ' || (v->>'outstanding');
  ASSERT (v->'statement'->0->>'balance')::numeric = 10, 'vera final balance';
  -- Unpaid-fee total keeps its existing (0397) meaning: all own unpaid fees.
  ASSERT (v->>'unpaidFeesTotal')::numeric = 510, 'vera unpaidFeesTotal ' || (v->>'unpaidFeesTotal');
END $$;
