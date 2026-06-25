
-- ===== stitch_mandates =====
CREATE TABLE public.stitch_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  club_member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  gateway text NOT NULL DEFAULT 'stitch',
  rail text NOT NULL CHECK (rail IN ('debicheck','eft_debit')),
  max_amount_cents integer NOT NULL CHECK (max_amount_cents > 0),
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','adhoc')),
  debit_day integer CHECK (debit_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','failed')),
  stitch_mandate_id text,
  auth_url text,
  fee_category_id uuid,
  authorised_at timestamptz,
  cancelled_at timestamptz,
  last_collection_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stitch_mandates_member ON public.stitch_mandates(club_member_id);
CREATE INDEX idx_stitch_mandates_club_status ON public.stitch_mandates(club_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stitch_mandates TO authenticated;
GRANT ALL ON public.stitch_mandates TO service_role;
ALTER TABLE public.stitch_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their own mandates"
  ON public.stitch_mandates FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Club admins view club mandates"
  ON public.stitch_mandates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = stitch_mandates.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  ));

CREATE POLICY "Members cancel their own mandates"
  ON public.stitch_mandates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===== stitch_collections =====
CREATE TABLE public.stitch_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  mandate_id uuid NOT NULL REFERENCES public.stitch_mandates(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL,
  fee_payable_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','approved','skipped','submitted','paid','failed')),
  approval_required boolean NOT NULL DEFAULT true,
  approved_at timestamptz,
  approved_by uuid,
  submitted_at timestamptz,
  settled_at timestamptz,
  failed_reason text,
  stitch_collection_id text,
  retry_of uuid REFERENCES public.stitch_collections(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stitch_collections_mandate ON public.stitch_collections(mandate_id);
CREATE INDEX idx_stitch_collections_club_status ON public.stitch_collections(club_id, status);
CREATE INDEX idx_stitch_collections_due ON public.stitch_collections(due_date) WHERE status IN ('queued','approved');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stitch_collections TO authenticated;
GRANT ALL ON public.stitch_collections TO service_role;
ALTER TABLE public.stitch_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their own collections"
  ON public.stitch_collections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = stitch_collections.club_member_id
      AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Club admins manage club collections"
  ON public.stitch_collections FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = stitch_collections.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = stitch_collections.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  ));

-- ===== member_fee_categories: recurring flags =====
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS recurring_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_rails text[] NOT NULL DEFAULT ARRAY['debicheck','eft_debit']::text[],
  ADD COLUMN IF NOT EXISTS recurring_debit_day integer CHECK (recurring_debit_day BETWEEN 1 AND 31);

-- ===== club_members: access suspension flag =====
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS access_suspended_at timestamptz;

-- ===== updated_at triggers =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_stitch_mandates_updated
  BEFORE UPDATE ON public.stitch_mandates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_stitch_collections_updated
  BEFORE UPDATE ON public.stitch_collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
