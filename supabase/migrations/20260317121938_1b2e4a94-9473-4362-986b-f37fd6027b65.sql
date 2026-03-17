
-- Platform-level subscription pricing configuration (managed by super admin)
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_per_member numeric NOT NULL DEFAULT 5,
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  minimum_charge numeric NOT NULL DEFAULT 100,
  trial_days integer NOT NULL DEFAULT 30,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-club subscription tracking
CREATE TABLE public.club_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  member_count integer NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_id)
);

-- RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscription plans: readable by all authenticated, manageable by admins
CREATE POLICY "Anyone authenticated can view plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins can manage plans" ON public.subscription_plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Club subscriptions: readable by club admins and platform admins
CREATE POLICY "Platform admins can manage subscriptions" ON public.club_subscriptions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Club admins can view own subscription" ON public.club_subscriptions FOR SELECT TO authenticated USING (is_club_admin(auth.uid(), club_id));

-- Insert a default plan
INSERT INTO public.subscription_plans (name, description, price_per_member, billing_cycle, minimum_charge, trial_days, is_default)
VALUES ('Standard', 'Per-member monthly billing', 5, 'monthly', 100, 30, true);
