
-- Re-rank ladder_position so that members in stronger leagues sit higher.
-- Order within a club+gender:
--   1. Best (lowest-numbered) league the member is registered in
--   2. Existing ladder_position (nulls last)
--   3. Name
-- After this runs, the displayed rank == ladder_position.

CREATE OR REPLACE FUNCTION public.renumber_club_ladder(p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH league_rank AS (
    SELECT id,
           COALESCE(NULLIF(substring(name from '(\d+)'), '')::int, 9999) AS rnk
    FROM public.leagues
    WHERE club_id = p_club_id
  ),
  member_best_league AS (
    SELECT mlr.club_member_id, MIN(lr.rnk) AS best_rnk
    FROM public.member_league_registrations mlr
    JOIN league_rank lr ON lr.id = mlr.league_id
    GROUP BY mlr.club_member_id
  ),
  ranked AS (
    SELECT
      cm.id,
      CASE WHEN lower(coalesce(cm.gender,'')) IN ('female','ladies','f')
           THEN 'ladies' ELSE 'men' END AS bucket,
      ROW_NUMBER() OVER (
        PARTITION BY
          CASE WHEN lower(coalesce(cm.gender,'')) IN ('female','ladies','f')
               THEN 'ladies' ELSE 'men' END
        ORDER BY
          COALESCE(mbl.best_rnk, 9999) ASC,
          (cm.ladder_position IS NULL),     -- nulls last
          cm.ladder_position ASC NULLS LAST,
          cm.name ASC
      ) AS new_pos
    FROM public.club_members cm
    LEFT JOIN member_best_league mbl ON mbl.club_member_id = cm.id
    WHERE cm.club_id = p_club_id
  )
  UPDATE public.club_members cm
  SET ladder_position = r.new_pos
  FROM ranked r
  WHERE cm.id = r.id
    AND (cm.ladder_position IS DISTINCT FROM r.new_pos);
END;
$$;

-- Run it for every club that has any league members
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT DISTINCT club_id FROM public.club_members WHERE club_id IS NOT NULL
  LOOP
    PERFORM public.renumber_club_ladder(c.club_id);
  END LOOP;
END $$;
