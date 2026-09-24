CREATE OR REPLACE FUNCTION public.structured_commit(p_tid uuid, p_ops jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  op jsonb; r jsonb; t text; cols text; n_ins int := 0; n_del int := 0; k int;
BEGIN
  IF NOT public.can_manage_tournament(auth.uid(), p_tid) THEN
    RAISE EXCEPTION 'Not allowed to manage this tournament' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tid AND builder_architecture = 'structured') THEN
    RAISE EXCEPTION 'Only structured (Beta) tournaments use this path';
  END IF;
  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) LOOP
    t := op->>'table';
    IF op->>'op' = 'insert' THEN
      IF t NOT IN ('tournament_divisions','tournament_stages','tournament_pools','club_champs_rounds','club_champs_matches') THEN
        RAISE EXCEPTION 'Table % not allowed', t;
      END IF;
      FOR r IN SELECT * FROM jsonb_array_elements(op->'rows') LOOP
        IF COALESCE(r->>'tournament_id', r->>'champ_id') IS DISTINCT FROM p_tid::text THEN
          RAISE EXCEPTION 'Row does not belong to this tournament';
        END IF;
        SELECT string_agg(quote_ident(key), ',') INTO cols FROM jsonb_object_keys(r) key;
        EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', t, cols, cols, t) USING r;
        n_ins := n_ins + 1;
      END LOOP;
    ELSIF op->>'op' = 'delete_unplayed_matches' THEN
      DELETE FROM public.club_champs_matches
       WHERE champ_id = p_tid
         AND id IN (SELECT (jsonb_array_elements_text(op->'ids'))::uuid)
         AND winner_member_id IS NULL
         AND COALESCE(lower(status), '') NOT IN ('completed','confirmed','in_progress','walkover','forfeit');
      GET DIAGNOSTICS k = ROW_COUNT;
      IF k <> jsonb_array_length(op->'ids') THEN
        RAISE EXCEPTION 'Refused: % of % games are played or started and cannot be removed', jsonb_array_length(op->'ids') - k, jsonb_array_length(op->'ids');
      END IF;
      n_del := n_del + k;
    ELSIF op->>'op' = 'delete_entries' THEN
      DELETE FROM public.club_champs_entries
       WHERE champ_id = p_tid AND id IN (SELECT (jsonb_array_elements_text(op->'ids'))::uuid);
    ELSE
      RAISE EXCEPTION 'Unknown op %', op->>'op';
    END IF;
  END LOOP;
  -- Remove rounds left without games (only generated, structured rounds)
  DELETE FROM public.club_champs_rounds cr
   WHERE cr.champ_id = p_tid AND cr.stage_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.club_champs_matches m WHERE m.round_id = cr.id);
  RETURN jsonb_build_object('inserted', n_ins, 'deleted', n_del);
END;
$$;
REVOKE ALL ON FUNCTION public.structured_commit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.structured_commit(uuid, jsonb) TO authenticated;