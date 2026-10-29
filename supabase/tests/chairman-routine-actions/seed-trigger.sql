CREATE OR REPLACE FUNCTION public.trg_seed_member_default_fees()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.seed_member_default_fees(NEW.id);
  RETURN NEW;
END;
$$;