
CREATE TRIGGER trg_apply_confirmed_match_effects
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_confirmed_match_effects();
