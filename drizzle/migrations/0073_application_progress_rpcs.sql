CREATE OR REPLACE FUNCTION public.get_my_application_progress(_club_member_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT application_progress FROM public.club_members
  WHERE id = _club_member_id AND user_id = auth.uid() AND fee_category_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.save_my_application_progress(_club_member_id uuid, _progress jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _progress IS NOT NULL AND octet_length(_progress::text) > 20000 THEN
    RAISE EXCEPTION 'Progress too large';
  END IF;
  -- Only the applicant's own unfinished self-application; strip anything secret-like.
  UPDATE public.club_members
     SET application_progress = CASE WHEN _progress IS NULL THEN NULL
                                     ELSE _progress - 'password' - 'token' END
   WHERE id = _club_member_id AND user_id = auth.uid()
     AND (fee_category_id IS NULL OR _progress IS NULL)
     AND (is_pending_approval OR applied_at IS NOT NULL OR _progress IS NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

REVOKE ALL ON FUNCTION public.get_my_application_progress(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_application_progress(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_application_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_application_progress(uuid, jsonb) TO authenticated;