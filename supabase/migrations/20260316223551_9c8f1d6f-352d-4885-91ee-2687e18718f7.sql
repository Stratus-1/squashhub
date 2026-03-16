-- Make member_credit_transactions derive club context from club_member_id, not user_id
-- This aligns transaction ownership with the club member architecture.

CREATE OR REPLACE FUNCTION public.set_member_credit_transaction_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_user_id uuid;
BEGIN
  IF NEW.club_member_id IS NULL THEN
    RAISE EXCEPTION 'club_member_id is required for member credit transactions';
  END IF;

  SELECT cm.club_id, cm.user_id
  INTO v_club_id, v_user_id
  FROM public.club_members cm
  WHERE cm.id = NEW.club_member_id
  LIMIT 1;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No club membership found for member %', NEW.club_member_id;
  END IF;

  IF NEW.club_id IS NULL THEN
    NEW.club_id := v_club_id;
  ELSIF NEW.club_id <> v_club_id THEN
    RAISE EXCEPTION 'club_id does not match club_member_id';
  END IF;

  -- Keep user_id in sync only when a linked auth user exists.
  IF v_user_id IS NOT NULL THEN
    IF NEW.user_id IS NULL THEN
      NEW.user_id := v_user_id;
    ELSIF NEW.user_id <> v_user_id THEN
      RAISE EXCEPTION 'user_id does not match club_member_id linkage';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Users can insert own credit transactions" ON public.member_credit_transactions;

CREATE POLICY "Users can insert own credit transactions"
ON public.member_credit_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = member_credit_transactions.club_member_id
      AND cm.user_id = auth.uid()
      AND cm.club_id = member_credit_transactions.club_id
  )
);