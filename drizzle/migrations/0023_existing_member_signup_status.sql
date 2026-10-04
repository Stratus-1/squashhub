-- Explains WHY the existing-member lookup found no unclaimed row. Returns only a status word, never names or details.
CREATE OR REPLACE FUNCTION public.existing_member_signup_status(_club_id uuid, _email text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _club_id IS NULL OR lower(btrim(coalesce(_email,''))) = '' THEN 'not_found'
    WHEN EXISTS (SELECT 1 FROM public.club_members cm
                 WHERE cm.club_id = _club_id AND cm.user_id IS NOT NULL
                   AND lower(btrim(coalesce(cm.email,''))) = lower(btrim(_email))) THEN 'already_linked'
    WHEN EXISTS (SELECT 1 FROM public.club_members cm
                 WHERE cm.club_id = _club_id AND cm.user_id IS NULL
                   AND lower(btrim(coalesce(cm.email,''))) = lower(btrim(_email))) THEN 'verification_mismatch'
    ELSE 'not_found'
  END
$$;
REVOKE ALL ON FUNCTION public.existing_member_signup_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.existing_member_signup_status(uuid, text) TO anon, authenticated;