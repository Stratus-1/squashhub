CREATE TABLE public.tournament_whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL UNIQUE REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual',
  invite_url text,
  group_name text,
  description text,
  announcements_only boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_whatsapp_groups TO authenticated;
GRANT ALL ON public.tournament_whatsapp_groups TO service_role;
ALTER TABLE public.tournament_whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View group when you may view the tournament"
  ON public.tournament_whatsapp_groups FOR SELECT TO authenticated
  USING (public.can_view_tournament(auth.uid(), champ_id));

CREATE POLICY "Organisers manage the tournament group"
  ON public.tournament_whatsapp_groups FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), champ_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), champ_id));

CREATE TRIGGER trg_tournament_whatsapp_groups_updated
  BEFORE UPDATE ON public.tournament_whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tournament_whatsapp_group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tournament_whatsapp_groups(id) ON DELETE CASCADE,
  champ_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  phone text,
  channel text,
  sent_at timestamptz,
  send_error text,
  link_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, club_member_id)
);

GRANT SELECT ON public.tournament_whatsapp_group_invites TO authenticated;
GRANT ALL ON public.tournament_whatsapp_group_invites TO service_role;
ALTER TABLE public.tournament_whatsapp_group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisers see who was sent the group link"
  ON public.tournament_whatsapp_group_invites FOR SELECT TO authenticated
  USING (public.can_manage_tournament(auth.uid(), champ_id));

CREATE TRIGGER trg_tournament_whatsapp_group_invites_updated
  BEFORE UPDATE ON public.tournament_whatsapp_group_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tournament_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.club_champs_registrations(id) ON DELETE SET NULL,
  reason text,
  source text NOT NULL DEFAULT 'deep_link',
  status text NOT NULL DEFAULT 'pending',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.tournament_withdrawal_requests TO authenticated;
GRANT ALL ON public.tournament_withdrawal_requests TO service_role;
ALTER TABLE public.tournament_withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisers see withdrawal requests"
  ON public.tournament_withdrawal_requests FOR SELECT TO authenticated
  USING (public.can_manage_tournament(auth.uid(), champ_id));

CREATE POLICY "Organisers resolve withdrawal requests"
  ON public.tournament_withdrawal_requests FOR UPDATE TO authenticated
  USING (public.can_manage_tournament(auth.uid(), champ_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), champ_id));

CREATE TRIGGER trg_tournament_withdrawal_requests_updated
  BEFORE UPDATE ON public.tournament_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tournament_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid,
  member_number text,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tournament_lookup_attempts TO service_role;
ALTER TABLE public.tournament_lookup_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tournament_lookup_attempts_recent
  ON public.tournament_lookup_attempts (champ_id, member_number, created_at DESC);

-- Lookup only: membership number + last four digits of the registered mobile.
-- Returns a masked phone number so the player can confirm where the link will
-- go. It never returns the full number, the member name or an invite link, and
-- it is never treated as proof of identity on its own.
CREATE OR REPLACE FUNCTION public.tournament_member_lookup(
  p_champ_id uuid,
  p_member_number text,
  p_last4 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_champ record;
  v_member record;
  v_digits text;
  v_recent int;
  v_number text := trim(COALESCE(p_member_number, ''));
  v_four text := regexp_replace(COALESCE(p_last4, ''), '\D', '', 'g');
  v_has_entry boolean := false;
BEGIN
  IF v_number = '' OR length(v_four) < 4 THEN
    RETURN jsonb_build_object('found', false, 'reason', 'incomplete');
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.tournament_lookup_attempts
   WHERE champ_id = p_champ_id
     AND member_number = v_number
     AND ok = false
     AND created_at > now() - interval '15 minutes';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('found', false, 'reason', 'locked');
  END IF;

  SELECT id, club_id, name INTO v_champ FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'reason', 'unknown_tournament');
  END IF;

  SELECT m.id, m.phone, m.club_id
    INTO v_member
    FROM public.club_members m
   WHERE lower(trim(COALESCE(m.club_member_number, ''))) = lower(v_number)
     AND length(regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g')) >= 4
     AND right(regexp_replace(m.phone, '\D', '', 'g'), 4) = v_four
     AND (m.club_id = v_champ.club_id
          OR EXISTS (SELECT 1 FROM public.club_champs_registrations r
                      WHERE r.champ_id = p_champ_id AND r.club_member_id = m.id))
   ORDER BY (m.club_id = v_champ.club_id) DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.tournament_lookup_attempts (champ_id, member_number, ok)
    VALUES (p_champ_id, v_number, false);
    RETURN jsonb_build_object('found', false, 'reason', 'no_match');
  END IF;

  INSERT INTO public.tournament_lookup_attempts (champ_id, member_number, ok)
  VALUES (p_champ_id, v_number, true);

  SELECT EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.club_member_id = v_member.id
       AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'declined')
  ) INTO v_has_entry;

  v_digits := regexp_replace(COALESCE(v_member.phone, ''), '\D', '', 'g');

  RETURN jsonb_build_object(
    'found', true,
    'masked_phone', '•••• ' || right(v_digits, 4),
    'has_entry', v_has_entry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_member_lookup(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_member_lookup(uuid, text, text) TO anon, authenticated, service_role;