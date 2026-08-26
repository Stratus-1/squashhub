INSERT INTO public.club_membership_rules (
  club_id,
  rules_text,
  show_on_landing,
  require_acceptance,
  acceptance_statement
)
SELECT
  c.id,
  $rules$Club rules for members
1. Only squash/court shoes allowed. Fine for playing with incorrect shoes is R1000.
2. Bookings must be cancelled at least 2 hours before the time. In peak time, please notify a committee member so members can be informed on the main group. Fine for not pitching up for your game R100.
3. No double bookings in peak time. Not allowed to book more than 1 hour during peak hours (peak hours 16h00–18h00).
4. No coaching on court 1 & 2 without permission from the committee.
5. Drills for practice only on Court 3 and not during peak time.
6. No smoking or vaping in the building. Please make use of the area indicated.
7. Dress code: appropriate and decent (no gym tops, revealing bellies etc).

Rules for Juniors/Scholars
1. Juniors are allowed to book court 1, only with a senior member.
2. Juniors must wear glasses at all times while on court. Fail to comply, R50 fine.$rules$,
  true,
  true,
  $stmt$I hereby subject myself to the constitution and the house rules of the squash club. / Hiermee onderwerp ek my aan die konstitusie en huisreëls van die muurbalklub.$stmt$
FROM public.clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_membership_rules r WHERE r.club_id = c.id
);