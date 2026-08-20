ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS leagues_club_active_idx
  ON public.leagues (club_id) WHERE archived_at IS NULL;

-- Archived seasons are read-only: the only permitted change is un-archiving.
CREATE OR REPLACE FUNCTION public.enforce_archived_league_readonly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'This league belongs to an archived season and cannot be deleted. Un-archive the season first.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.archived_at IS NOT NULL THEN
    IF NEW.archived_at IS NOT NULL THEN
      -- Only the archive bookkeeping columns may move while archived.
      IF (to_jsonb(NEW) - 'archived_at' - 'archived_by' - 'archive_reason' - 'updated_at')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'archived_at' - 'archived_by' - 'archive_reason' - 'updated_at') THEN
        RAISE EXCEPTION 'This league belongs to an archived season and is read-only. Un-archive the season to make changes.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leagues_archived_readonly ON public.leagues;
CREATE TRIGGER trg_leagues_archived_readonly
  BEFORE UPDATE OR DELETE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_archived_league_readonly();

CREATE OR REPLACE FUNCTION public.archive_club_season(
  _club_id uuid,
  _season_year integer,
  _association_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Only club admins can archive a season';
  END IF;
  IF _season_year IS NULL THEN
    RAISE EXCEPTION 'A season year is required';
  END IF;

  UPDATE public.leagues
     SET archived_at = now(),
         archived_by = auth.uid(),
         archive_reason = _reason
   WHERE club_id = _club_id
     AND season_year = _season_year
     AND archived_at IS NULL
     AND (_association_id IS NULL OR association_id = _association_id);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_club_season(
  _club_id uuid,
  _season_year integer,
  _association_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Only club admins can un-archive a season';
  END IF;

  UPDATE public.leagues
     SET archived_at = NULL,
         archived_by = NULL,
         archive_reason = NULL
   WHERE club_id = _club_id
     AND season_year = _season_year
     AND archived_at IS NOT NULL
     AND (_association_id IS NULL OR association_id = _association_id);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_club_season(uuid, integer, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unarchive_club_season(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_club_season(uuid, integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_club_season(uuid, integer, uuid) TO authenticated, service_role;