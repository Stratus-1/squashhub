CREATE OR REPLACE FUNCTION public.grant_htsm_admin_for_marlize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id = '3d4724c9-3c50-4fb3-a497-5af54f5b9d84'
     AND lower(NEW.email) = 'willemsemarlize1@gmail.com'
     AND NEW.role <> 'admin' THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER htsm_marlize_admin_on_insert
BEFORE INSERT ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.grant_htsm_admin_for_marlize();

CREATE TRIGGER htsm_marlize_admin_on_email_update
BEFORE UPDATE OF email, club_id ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.grant_htsm_admin_for_marlize();

-- Immediate backfill in case her record already exists at the club
UPDATE public.club_members
SET role = 'admin'
WHERE club_id = '3d4724c9-3c50-4fb3-a497-5af54f5b9d84'
  AND lower(email) = 'willemsemarlize1@gmail.com'
  AND role <> 'admin';