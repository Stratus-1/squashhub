ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS affects_ladder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.league_associations.affects_ladder IS
  'When true and scope=internal, results from this association''s leagues can leapfrog the club ladder.';

CREATE TABLE IF NOT EXISTS public.ladder_adjustment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  association_id uuid REFERENCES public.league_associations(id) ON DELETE SET NULL,
  fixture_id uuid,
  round_id uuid,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  old_position integer,
  new_position integer NOT NULL,
  reason text NOT NULL,
  batch_id uuid NOT NULL,
  applied_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ladder_adj_log_club ON public.ladder_adjustment_log(club_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_ladder_adj_log_batch ON public.ladder_adjustment_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_ladder_adj_log_fixture ON public.ladder_adjustment_log(fixture_id);

GRANT SELECT ON public.ladder_adjustment_log TO authenticated;
GRANT ALL ON public.ladder_adjustment_log TO service_role;

ALTER TABLE public.ladder_adjustment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins view ladder adjustment log" ON public.ladder_adjustment_log;
CREATE POLICY "Club admins view ladder adjustment log"
  ON public.ladder_adjustment_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_admin(auth.uid(), club_id)
    OR public.is_platform_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.guard_bulk_ladder_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source text;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM new_table n
  JOIN old_table o ON o.id = n.id
  WHERE n.ladder_position IS DISTINCT FROM o.ladder_position;

  IF v_count <= 5 THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_source := current_setting('app.ladder_change_source', true);
  EXCEPTION WHEN OTHERS THEN
    v_source := NULL;
  END;

  IF v_source IN ('admin_reorder', 'nsc_restore', 'challenge_swap', 'admin_allocate', 'league_internal_apply') THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Bulk ladder change blocked: % rows changed without app.ladder_change_source flag. Set it to admin_reorder/admin_allocate/challenge_swap/nsc_restore/league_internal_apply to allow.', v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_ladder_adjustments(
  _club_id uuid,
  _association_id uuid,
  _fixture_id uuid,
  _adjustments jsonb,
  _summary text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_uid uuid := auth.uid();
  v_adj jsonb;
  v_temp_pos int;
  v_max_pos int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_club_admin(v_uid, _club_id) OR public.is_platform_admin(v_uid)) THEN
    RAISE EXCEPTION 'Only club admins can apply ladder adjustments';
  END IF;

  IF jsonb_typeof(_adjustments) <> 'array' OR jsonb_array_length(_adjustments) = 0 THEN
    RAISE EXCEPTION 'No adjustments supplied';
  END IF;

  PERFORM set_config('app.ladder_change_source', 'league_internal_apply', true);

  SELECT COALESCE(MAX(ladder_position), 0) INTO v_max_pos
  FROM public.club_members WHERE club_id = _club_id;

  v_temp_pos := v_max_pos + 1000;

  FOR v_adj IN SELECT * FROM jsonb_array_elements(_adjustments) LOOP
    UPDATE public.club_members
      SET ladder_position = v_temp_pos
      WHERE id = (v_adj->>'member_id')::uuid AND club_id = _club_id;
    v_temp_pos := v_temp_pos + 1;
  END LOOP;

  FOR v_adj IN SELECT * FROM jsonb_array_elements(_adjustments) LOOP
    UPDATE public.club_members
      SET ladder_position = (v_adj->>'new_position')::int
      WHERE id = (v_adj->>'member_id')::uuid AND club_id = _club_id;

    INSERT INTO public.ladder_adjustment_log(
      club_id, association_id, fixture_id, club_member_id,
      old_position, new_position, reason, batch_id, applied_by
    ) VALUES (
      _club_id,
      _association_id,
      _fixture_id,
      (v_adj->>'member_id')::uuid,
      NULLIF(v_adj->>'old_position','')::int,
      (v_adj->>'new_position')::int,
      COALESCE(v_adj->>'reason', _summary, 'Internal league result'),
      v_batch_id,
      v_uid
    );
  END LOOP;

  RETURN v_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_ladder_adjustments(uuid, uuid, uuid, jsonb, text) TO authenticated;