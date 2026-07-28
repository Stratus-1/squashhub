update public.stitch_mandates
set status = 'active', authorised_at = now(), updated_at = now(), initial_amount_cents = 2000
where id = '49bf1fd6-8baa-4a17-bb6d-8491c1295843' and status in ('pending','active');

select public.record_mandate_initial_payment('49bf1fd6-8baa-4a17-bb6d-8491c1295843'::uuid);