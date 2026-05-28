CREATE TABLE public.member_gobook_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_member_id UUID NOT NULL UNIQUE REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  gobook_username TEXT NOT NULL,
  gobook_password_ciphertext TEXT NOT NULL,
  gobook_password_iv TEXT NOT NULL,
  last_verified_at TIMESTAMPTZ,
  last_verification_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_gobook_credentials TO authenticated;
GRANT ALL ON public.member_gobook_credentials TO service_role;

ALTER TABLE public.member_gobook_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own GoBook creds"
  ON public.member_gobook_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members insert their own GoBook creds"
  ON public.member_gobook_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = club_member_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members update their own GoBook creds"
  ON public.member_gobook_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members delete their own GoBook creds"
  ON public.member_gobook_credentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_member_gobook_credentials_updated_at
  BEFORE UPDATE ON public.member_gobook_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_member_gobook_credentials_user ON public.member_gobook_credentials(user_id);