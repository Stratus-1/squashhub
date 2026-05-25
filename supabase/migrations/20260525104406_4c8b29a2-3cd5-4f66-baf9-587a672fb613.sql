
-- Helper function: create a pending member_credit_transaction for a tournament EFT registration
CREATE OR REPLACE FUNCTION public.tournament_reg_create_pending_eft_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member record;
  v_champ record;
  v_amount numeric;
  v_ref text;
BEGIN
  IF NEW.status <> 'pending_eft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending_eft' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = NEW.club_member_id;
  IF v_member.user_id IS NULL THEN
    RETURN NEW; -- cannot create transaction without auth user
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = NEW.champ_id;
  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_ref := 'TOURN-REG-' || NEW.id::text;

  -- Idempotent: skip if a tx with this reference already exists
  IF EXISTS (SELECT 1 FROM public.member_credit_transactions WHERE reference = v_ref) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.member_credit_transactions (
    user_id, club_id, club_member_id, amount, type, method, description, reference, status
  ) VALUES (
    v_member.user_id,
    v_member.club_id,
    v_member.id,
    v_amount,
    'tournament_entry',
    'eft',
    COALESCE(v_champ.name, 'Tournament') || ' entry fee (EFT)',
    v_ref,
    'pending'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_reg_pending_eft_ins ON public.club_champs_registrations;
CREATE TRIGGER trg_tournament_reg_pending_eft_ins
AFTER INSERT ON public.club_champs_registrations
FOR EACH ROW
EXECUTE FUNCTION public.tournament_reg_create_pending_eft_tx();

DROP TRIGGER IF EXISTS trg_tournament_reg_pending_eft_upd ON public.club_champs_registrations;
CREATE TRIGGER trg_tournament_reg_pending_eft_upd
AFTER UPDATE OF status ON public.club_champs_registrations
FOR EACH ROW
WHEN (NEW.status = 'pending_eft' AND OLD.status IS DISTINCT FROM 'pending_eft')
EXECUTE FUNCTION public.tournament_reg_create_pending_eft_tx();

-- Backfill any current pending_eft registrations missing a transaction
INSERT INTO public.member_credit_transactions (
  user_id, club_id, club_member_id, amount, type, method, description, reference, status
)
SELECT
  m.user_id,
  m.club_id,
  m.id,
  (COALESCE(c.entry_fee_cents, 0)::numeric / 100),
  'tournament_entry',
  'eft',
  COALESCE(c.name, 'Tournament') || ' entry fee (EFT)',
  'TOURN-REG-' || r.id::text,
  'pending'
FROM public.club_champs_registrations r
JOIN public.club_members m ON m.id = r.club_member_id
JOIN public.club_champs c ON c.id = r.champ_id
WHERE r.status = 'pending_eft'
  AND m.user_id IS NOT NULL
  AND COALESCE(c.entry_fee_cents, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.member_credit_transactions t
    WHERE t.reference = 'TOURN-REG-' || r.id::text
  );
