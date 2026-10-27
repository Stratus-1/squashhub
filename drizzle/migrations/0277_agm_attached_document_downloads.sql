CREATE OR REPLACE FUNCTION public.agm_document_is_attached(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT EXISTS (SELECT 1 FROM public.agm_ballots b WHERE b.documents @> jsonb_build_array(jsonb_build_object('path', p_path)));
$$;
REVOKE ALL ON FUNCTION public.agm_document_is_attached(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agm_document_is_attached(text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.agm_document_is_attached(text) IS 'Boolean-only exact attached-path check for AGM document downloads; exposes no ballot, voter, or vote data and bypasses ballot RLS only for attachment existence.';
ALTER POLICY "Attached AGM documents are readable" ON storage.objects TO anon, authenticated
USING (bucket_id = 'agm-documents' AND public.agm_document_is_attached(name));