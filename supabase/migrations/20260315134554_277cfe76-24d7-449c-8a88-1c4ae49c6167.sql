
-- Fix mutable search_path on validate_challenge_insert
ALTER FUNCTION public.validate_challenge_insert() SET search_path = public;
