CREATE OR REPLACE FUNCTION public.enforce_single_active_mandate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.stitch_mandates
       SET status = 'cancelled',
           updated_at = now()
     WHERE club_member_id = NEW.club_member_id
       AND id <> NEW.id
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_active_mandate ON public.stitch_mandates;
CREATE TRIGGER trg_enforce_single_active_mandate
AFTER INSERT OR UPDATE OF status ON public.stitch_mandates
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.enforce_single_active_mandate();

CREATE UNIQUE INDEX IF NOT EXISTS stitch_mandates_one_active_per_member
  ON public.stitch_mandates (club_member_id)
  WHERE status = 'active';