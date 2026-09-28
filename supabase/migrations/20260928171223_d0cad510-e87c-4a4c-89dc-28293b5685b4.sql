UPDATE public.league_rules SET allow_multi_fixture_per_night = false WHERE id = 'c205bdf4-5ce2-41fb-bd57-5fdd0d499692';
DO $$
DECLARE s text;
BEGIN
  CREATE TEMP TABLE _ids ON COMMIT DROP AS SELECT id FROM public.maintenance_cases WHERE status='new' AND club_id='061e6dd9-0ec2-4427-a939-3f18ad0884c8';
  FOREACH s IN ARRAY ARRAY['analysing','issue_identified','awaiting_approval','approved','ready_for_release','released','completed'] LOOP
    UPDATE public.maintenance_cases SET status=s, last_actor_type='super_admin', updated_at=now()
    WHERE id IN (SELECT id FROM _ids);
  END LOOP;
END $$;