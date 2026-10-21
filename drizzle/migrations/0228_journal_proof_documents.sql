CREATE TABLE public.club_journal_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  journal_ref uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.club_journal_attachments(club_id, journal_ref);
GRANT SELECT, INSERT ON public.club_journal_attachments TO authenticated;
GRANT ALL ON public.club_journal_attachments TO service_role;
ALTER TABLE public.club_journal_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance reads proofs" ON public.club_journal_attachments FOR SELECT TO authenticated
  USING (is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR has_club_permission(auth.uid(), club_id, 'finance'));
CREATE POLICY "Finance adds proofs" ON public.club_journal_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND (is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR has_club_permission(auth.uid(), club_id, 'finance')));

CREATE POLICY "Finance reads proof files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='finance-proofs' AND (is_club_admin_or_permitted(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance') OR has_club_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance')));
CREATE POLICY "Finance uploads proof files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='finance-proofs' AND (is_club_admin_or_permitted(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance') OR has_club_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance')));