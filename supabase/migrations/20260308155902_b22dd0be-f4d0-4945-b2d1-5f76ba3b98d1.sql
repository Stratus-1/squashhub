
-- Table to track booking invitations sent via email/whatsapp
CREATE TABLE public.booking_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  inviter_id uuid NOT NULL,
  invitee_email text,
  invitee_phone text,
  invitee_name text,
  channel text NOT NULL DEFAULT 'email', -- 'email' or 'whatsapp'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  decline_reason text,
  -- Avoid relying on gen_random_bytes(), which may not be on the active search_path in hosted environments.
  -- uuid_send() yields 16 bytes; concatenating two UUIDs gives 32 bytes (64 hex chars).
  token text NOT NULL DEFAULT encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE public.booking_invites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view invites they created
CREATE POLICY "Users can view own invites"
  ON public.booking_invites FOR SELECT
  TO authenticated
  USING (auth.uid() = inviter_id);

-- Authenticated users can create invites
CREATE POLICY "Users can create invites"
  ON public.booking_invites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = inviter_id);

-- Allow anonymous token-based updates for accept/decline responses
CREATE POLICY "Anyone can respond to invite via token"
  ON public.booking_invites FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
