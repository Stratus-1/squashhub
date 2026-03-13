-- Add explicit tenant scoping to member credit transactions
ALTER TABLE public.member_credit_transactions
ADD COLUMN IF NOT EXISTS club_id uuid;

-- Backfill club_id from the member's club membership
UPDATE public.member_credit_transactions t
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = t.user_id
  AND t.club_id IS NULL;

-- Ensure club_id is always aligned with the transaction user membership
CREATE OR REPLACE FUNCTION public.set_member_credit_transaction_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT cm.club_id
  INTO v_club_id
  FROM public.club_members cm
  WHERE cm.user_id = NEW.user_id
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No club membership found for user %', NEW.user_id;
  END IF;

  IF NEW.club_id IS NULL THEN
    NEW.club_id := v_club_id;
  ELSIF NEW.club_id <> v_club_id THEN
    RAISE EXCEPTION 'club_id does not match user membership';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_member_credit_transaction_club_id_trigger ON public.member_credit_transactions;

CREATE TRIGGER set_member_credit_transaction_club_id_trigger
BEFORE INSERT OR UPDATE OF user_id, club_id
ON public.member_credit_transactions
FOR EACH ROW
EXECUTE FUNCTION public.set_member_credit_transaction_club_id();

-- Final backfill pass, then enforce non-null tenant linkage
UPDATE public.member_credit_transactions t
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = t.user_id
  AND t.club_id IS NULL;

ALTER TABLE public.member_credit_transactions
ALTER COLUMN club_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_member_credit_transactions_club_id
  ON public.member_credit_transactions(club_id);

CREATE INDEX IF NOT EXISTS idx_member_credit_transactions_club_user
  ON public.member_credit_transactions(club_id, user_id);

-- Tighten RLS to enforce tenant-aware reads/writes
DROP POLICY IF EXISTS "Club admins can update member credit transactions" ON public.member_credit_transactions;
DROP POLICY IF EXISTS "Club admins can view member credit transactions" ON public.member_credit_transactions;
DROP POLICY IF EXISTS "Users can insert own credit transactions" ON public.member_credit_transactions;
DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.member_credit_transactions;

CREATE POLICY "Club admins can update member credit transactions"
ON public.member_credit_transactions
FOR UPDATE
TO authenticated
USING (is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can view member credit transactions"
ON public.member_credit_transactions
FOR SELECT
TO authenticated
USING (is_club_admin(auth.uid(), club_id));

CREATE POLICY "Users can insert own credit transactions"
ON public.member_credit_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_club_member(auth.uid(), club_id)
);

CREATE POLICY "Users can view own credit transactions"
ON public.member_credit_transactions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND is_club_member(auth.uid(), club_id)
);