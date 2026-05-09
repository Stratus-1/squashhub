CREATE OR REPLACE FUNCTION public.create_default_finance_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.club_permission_roles (club_id, role_name, permissions)
  VALUES (NEW.id, 'Finance', ARRAY['fees','banking','members','bar','finance'])
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_finance_role ON public.clubs;
CREATE TRIGGER trg_create_default_finance_role
AFTER INSERT ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION public.create_default_finance_role();