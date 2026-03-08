
-- Replace the overly permissive update policy with a function that validates token
CREATE OR REPLACE FUNCTION public.respond_to_booking_invite(
  invite_token text,
  new_status text,
  reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.booking_invites
  SET status = new_status,
      decline_reason = CASE WHEN new_status = 'declined' THEN reason ELSE NULL END,
      responded_at = now()
  WHERE token = invite_token
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already responded invite';
  END IF;
END;
$$;

-- Drop the permissive update policy
DROP POLICY IF EXISTS "Anyone can respond to invite via token" ON public.booking_invites;
