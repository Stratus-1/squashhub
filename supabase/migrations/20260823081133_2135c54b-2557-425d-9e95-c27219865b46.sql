CREATE TABLE public.club_champs_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  champ_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_number integer NOT NULL DEFAULT 1,
  section_number integer NOT NULL DEFAULT 1,
  round_number integer NOT NULL,
  round_type text NOT NULL DEFAULT 'knockout',
  label text,
  play_by date,
  notes text,
  scheduling_mode text NOT NULL DEFAULT 'self',
  status text NOT NULL DEFAULT 'pending',
  generated_at timestamp with time zone,
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT club_champs_rounds_type_chk CHECK (round_type IN ('knockout','semi_final','final','third_place')),
  CONSTRAINT club_champs_rounds_mode_chk CHECK (scheduling_mode IN ('self','club')),
  CONSTRAINT club_champs_rounds_status_chk CHECK (status IN ('pending','active','complete')),
  CONSTRAINT club_champs_rounds_round_chk CHECK (round_number >= 1),
  CONSTRAINT club_champs_rounds_unique UNIQUE (champ_id, group_number, section_number, round_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_champs_rounds TO authenticated;
GRANT ALL ON public.club_champs_rounds TO service_role;

ALTER TABLE public.club_champs_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members and tournament officials can view champ rounds"
ON public.club_champs_rounds FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_rounds.champ_id
      AND (public.is_club_member(auth.uid(), c.club_id) OR public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs'))
  )
  OR public.can_view_tournament(auth.uid(), club_champs_rounds.champ_id)
);

CREATE POLICY "Tournament admins can insert champ rounds"
ON public.club_champs_rounds FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_rounds.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
  OR public.can_manage_tournament(auth.uid(), club_champs_rounds.champ_id)
);

CREATE POLICY "Tournament admins can update champ rounds"
ON public.club_champs_rounds FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_rounds.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
  OR public.can_manage_tournament(auth.uid(), club_champs_rounds.champ_id)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_rounds.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
  OR public.can_manage_tournament(auth.uid(), club_champs_rounds.champ_id)
);

CREATE POLICY "Tournament admins can delete champ rounds"
ON public.club_champs_rounds FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_rounds.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
  OR public.can_manage_tournament(auth.uid(), club_champs_rounds.champ_id)
);

CREATE TRIGGER update_club_champs_rounds_updated_at
BEFORE UPDATE ON public.club_champs_rounds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_club_champs_rounds_champ ON public.club_champs_rounds (champ_id, group_number, section_number, round_number);

ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.club_champs_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_champs_matches_round ON public.club_champs_matches (round_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_club_champs_ko_slot
  ON public.club_champs_matches (champ_id, group_number, section_number, round_number, bracket_position)
  WHERE stage = 'ko' AND bracket_position IS NOT NULL;