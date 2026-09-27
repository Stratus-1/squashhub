ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'invited',
  ADD COLUMN IF NOT EXISTS fee_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS registration_source text;

CREATE OR REPLACE FUNCTION public.derive_champ_registration_statuses()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fee integer; s text := lower(coalesce(NEW.status,''));
  v_money boolean; v_fee_ok boolean;
BEGIN
  SELECT coalesce(entry_fee_cents,0) INTO v_fee FROM club_champs WHERE id = NEW.champ_id;
  v_money := NEW.paid_at IS NOT NULL OR coalesce(NEW.fee_paid_cents,0) > 0;
  NEW.fee_status := CASE
    WHEN s = 'waived' THEN 'waived'
    WHEN v_money THEN 'paid'
    WHEN coalesce(v_fee,0) <= 0 THEN 'not_required'
    WHEN s = 'paid' THEN 'paid'
    WHEN s = 'pending_eft' THEN 'pending'
    ELSE 'due' END;
  v_fee_ok := NEW.fee_status IN ('paid','waived','not_required');
  IF s IN ('cancelled','declined','withdrawn') THEN
    NEW.registration_status := 'declined';
  ELSIF NEW.registration_source = 'organiser' AND (v_fee_ok OR s IN ('paid','waived')) THEN
    NEW.registration_status := 'registered';
  ELSIF s IN ('paid','waived','registered','active') OR (NEW.confirmed_at IS NOT NULL AND v_fee_ok) THEN
    NEW.registration_status := 'registered';
  ELSE
    NEW.registration_status := 'invited';
  END IF;
  IF NEW.registration_status = 'registered' AND NEW.registration_source IS NULL THEN
    NEW.registration_source := CASE WHEN NEW.confirmed_at IS NOT NULL THEN 'player' ELSE 'organiser' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_derive_champ_registration_statuses ON public.club_champs_registrations;
CREATE TRIGGER trg_derive_champ_registration_statuses
BEFORE INSERT OR UPDATE ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.derive_champ_registration_statuses();

CREATE OR REPLACE FUNCTION public.mark_registration_on_draw_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE club_champs_registrations
     SET registration_source = 'organiser', updated_at = now()
   WHERE champ_id = NEW.champ_id AND club_member_id = NEW.club_member_id
     AND registration_status = 'invited';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mark_registration_on_draw_entry ON public.club_champs_entries;
CREATE TRIGGER trg_mark_registration_on_draw_entry
AFTER INSERT ON public.club_champs_entries
FOR EACH ROW EXECUTE FUNCTION public.mark_registration_on_draw_entry();

-- Backfill: organiser-placed draw entries, then recompute everyone.
UPDATE public.club_champs_registrations r SET registration_source = 'organiser'
 WHERE lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
   AND r.confirmed_at IS NULL
   AND EXISTS (SELECT 1 FROM club_champs_entries e WHERE e.champ_id = r.champ_id AND e.club_member_id = r.club_member_id);
UPDATE public.club_champs_registrations SET status = status;

CREATE INDEX IF NOT EXISTS idx_ccr_champ_registration_status ON public.club_champs_registrations(champ_id, registration_status);