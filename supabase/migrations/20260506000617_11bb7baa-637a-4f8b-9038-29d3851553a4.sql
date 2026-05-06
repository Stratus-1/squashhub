-- Per-captain encrypted NSA login storage.
-- Stored as pgsodium-style ciphertext (we encrypt in the edge function with NSA_CRED_KEY).
-- Only the owning user (via their club_member_id) can read/write their own row.
-- Club admins CANNOT see another member's NSA password.

CREATE TABLE public.member_nsa_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_member_id UUID NOT NULL UNIQUE REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                 -- denormalised for fast RLS, must match auth.uid()
  nsa_username TEXT NOT NULL,            -- e.g. "NSF6916" - stored plaintext (it's the public ID)
  nsa_password_ciphertext TEXT NOT NULL, -- AES-GCM ciphertext, base64
  nsa_password_iv TEXT NOT NULL,         -- IV, base64
  last_verified_at TIMESTAMPTZ,
  last_verification_status TEXT,         -- 'ok' | 'invalid' | 'unknown'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.member_nsa_credentials ENABLE ROW LEVEL SECURITY;

-- Owner-only access. No admin override - this is the captain's personal NSA login.
CREATE POLICY "Members read their own NSA creds"
  ON public.member_nsa_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members insert their own NSA creds"
  ON public.member_nsa_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = club_member_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members update their own NSA creds"
  ON public.member_nsa_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members delete their own NSA creds"
  ON public.member_nsa_credentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_member_nsa_credentials_updated_at
  BEFORE UPDATE ON public.member_nsa_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_member_nsa_credentials_user ON public.member_nsa_credentials(user_id);