-- Owner-approved (4 Nov 2026): record Tarryn Faber's Ladies A Round 2 bye as a result, then create her decided Round 3 game.
-- The once-per-round guard is paused only inside this transaction for the single missing bye row.
ALTER TABLE public.club_champs_matches DISABLE TRIGGER trg_guard_structured_stage_round_once;
DO $$
DECLARE t uuid := 'f954222a-0f0a-4d8c-ac7b-9c74042cc69e'; tar uuid := '52928eff-d19e-496b-bb4c-d036cf66f1d6';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.club_champs_matches WHERE champ_id = t AND group_number = 5 AND round_number = 2 AND bye_member_id = tar) THEN
    INSERT INTO public.club_champs_matches (champ_id, group_number, round_number, player_a_member_id, status, winner_member_id, is_bye, bye_member_id, stage, play_by, round_id, stage_key, division_id, stage_id)
    VALUES (t, 5, 2, tar, 'completed', tar, true, tar, 'group', '2026-10-29', '7dda63c3-b6f8-4705-930d-8599ddc321d8', 'vmv6lrpfa-main', '52f900fd-1f45-41c9-9d6b-9084ca847497', '03eaf2a9-139c-41b6-830a-109a99a9364d');
  END IF;
END $$;
ALTER TABLE public.club_champs_matches ENABLE TRIGGER trg_guard_structured_stage_round_once;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.create_decided_swiss_game('f954222a-0f0a-4d8c-ac7b-9c74042cc69e'::uuid, 5, 3, '52928eff-d19e-496b-bb4c-d036cf66f1d6'::uuid, '5d9a4cda-ac3f-4169-bb42-780db5ec1224'::uuid, false);
  UPDATE public.club_champs_matches SET play_by = '2026-11-05'
   WHERE champ_id = 'f954222a-0f0a-4d8c-ac7b-9c74042cc69e' AND group_number = 5 AND round_number = 3 AND winner_member_id IS NULL AND play_by <> '2026-11-05';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;