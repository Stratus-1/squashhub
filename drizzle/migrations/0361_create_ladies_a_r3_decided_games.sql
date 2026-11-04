-- Owner-approved (4 Nov 2026): Ladies A Round 3 games fixed by the approved chart.
DO $$
DECLARE t uuid := 'f954222a-0f0a-4d8c-ac7b-9c74042cc69e';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.create_decided_swiss_game(t, 5, 3, '48753e87-4b1d-4e29-9503-34d00ed12933'::uuid, '36c10683-bce8-44ba-87c2-cf28bc52a658'::uuid, false);
  PERFORM public.create_decided_swiss_game(t, 5, 3, 'e2320e82-3e35-4bc9-a6c5-3a9031a5a1c1'::uuid, 'aff6396e-2684-4670-a2a7-c3a0cd1fcc60'::uuid, false);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;