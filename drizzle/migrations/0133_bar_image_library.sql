CREATE TABLE public.bar_image_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL UNIQUE,
  label text NOT NULL,
  keywords text NOT NULL DEFAULT '',
  category text,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bar_image_library TO authenticated;
GRANT ALL ON public.bar_image_library TO service_role;
ALTER TABLE public.bar_image_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can browse shared bar images"
  ON public.bar_image_library FOR SELECT TO authenticated USING (true);
COMMENT ON TABLE public.bar_image_library IS 'Shared, generic AI product photos any club may reuse for bar/shop items. Never holds club-uploaded photos.';