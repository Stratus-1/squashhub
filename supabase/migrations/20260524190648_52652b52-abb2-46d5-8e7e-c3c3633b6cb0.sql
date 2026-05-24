
ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS fee_payment_id uuid REFERENCES public.club_member_fee_payments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.accept_tournament_invite(
  p_registration_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled'
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;

  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';

    INSERT INTO public.club_member_fee_payments (
      club_member_id, fee_type, fee_label, amount, paid, season_year
    ) VALUES (
      v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
      EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int
    )
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount, paid = false, paid_at = NULL
    RETURNING id INTO v_fee_id;

    v_next_status := 'pending_eft';
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         fee_payment_id = COALESCE(v_fee_id, fee_payment_id)
   WHERE id = p_registration_id;

  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_tournament_invite(uuid, boolean) TO authenticated;
