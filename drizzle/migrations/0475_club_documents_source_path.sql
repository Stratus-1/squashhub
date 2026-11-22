ALTER TABLE public.club_documents ADD COLUMN IF NOT EXISTS source_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS club_documents_club_source_ref_uq ON public.club_documents (club_id, source_ref) WHERE source_ref IS NOT NULL;
COMMENT ON COLUMN public.club_documents.source_ref IS 'Origin of an imported file, e.g. stitch-onboarding:<path>; prevents duplicate imports.';