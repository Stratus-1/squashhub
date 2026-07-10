
CREATE TABLE public.help_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  role_tag TEXT NOT NULL DEFAULT 'member',
  provider TEXT NOT NULL DEFAULT 'youtube',
  video_id TEXT NOT NULL,
  duration_seconds INT,
  thumbnail_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_videos TO authenticated;
GRANT ALL ON public.help_videos TO service_role;

ALTER TABLE public.help_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view active help videos"
  ON public.help_videos FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can insert help videos"
  ON public.help_videos FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can update help videos"
  ON public.help_videos FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can delete help videos"
  ON public.help_videos FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_help_videos_category ON public.help_videos(category, sort_order);
CREATE INDEX idx_help_videos_active ON public.help_videos(is_active);

CREATE TRIGGER update_help_videos_updated_at
  BEFORE UPDATE ON public.help_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
