-- 1. New columns on club_champs
ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS registration_mode text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS partner_mode text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT ARRAY['card']::text[],
  ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS entries_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_registration_mode_check,
  ADD CONSTRAINT club_champs_registration_mode_check CHECK (registration_mode IN ('open','invite'));

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_partner_mode_check,
  ADD CONSTRAINT club_champs_partner_mode_check CHECK (partner_mode IN ('admin','players'));

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_entry_fee_cents_check,
  ADD CONSTRAINT club_champs_entry_fee_cents_check CHECK (entry_fee_cents >= 0);

-- 2. club_champs_registrations
CREATE TABLE IF NOT EXISTS public.club_champs_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.club_champs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  partner_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  partner_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','pending_eft','paid','waived','cancelled')),
  fee_paid_cents integer NOT NULL DEFAULT 0,
  payment_ref text,
  paid_at timestamptz,
  invited_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (champ_id, club_member_id)
);

CREATE INDEX IF NOT EXISTS idx_ccregs_champ ON public.club_champs_registrations(champ_id);
CREATE INDEX IF NOT EXISTS idx_ccregs_member ON public.club_champs_registrations(club_member_id);

ALTER TABLE public.club_champs_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage registrations"
  ON public.club_champs_registrations
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)));

CREATE POLICY "Members view registrations in their club"
  ON public.club_champs_registrations
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_member(auth.uid(), c.club_id)));

CREATE POLICY "Members create own registration"
  ON public.club_champs_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = club_member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members update own partner choice"
  ON public.club_champs_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = club_member_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = club_member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_ccregs_updated_at
  BEFORE UPDATE ON public.club_champs_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Yoco payment sessions: allow 'tournament' purpose + link to registration
ALTER TABLE public.yoco_payment_sessions
  ADD COLUMN IF NOT EXISTS champ_registration_id uuid REFERENCES public.club_champs_registrations(id) ON DELETE SET NULL;

ALTER TABLE public.yoco_payment_sessions
  DROP CONSTRAINT IF EXISTS yoco_payment_sessions_purpose_check;

ALTER TABLE public.yoco_payment_sessions
  ADD CONSTRAINT yoco_payment_sessions_purpose_check
    CHECK (purpose = ANY (ARRAY['fee','topup','bartab','tournament']));

CREATE INDEX IF NOT EXISTS idx_yoco_sessions_champ_reg ON public.yoco_payment_sessions(champ_registration_id) WHERE champ_registration_id IS NOT NULL;