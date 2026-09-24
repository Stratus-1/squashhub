CREATE POLICY "AI help screenshots: own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = 'ai-help' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "AI help screenshots: own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = 'ai-help' AND (storage.foldername(name))[2] = auth.uid()::text);