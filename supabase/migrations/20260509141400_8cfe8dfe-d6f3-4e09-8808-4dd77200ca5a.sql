-- Add attachments column (array of {path, name, size, mime})
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Create private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies: files are stored under <thread_id>/<filename>
-- Allow ticket owner and platform admins to read/write
CREATE POLICY "Support attachments: owner or admin can read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Support attachments: owner or admin can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Support attachments: owner or admin can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);