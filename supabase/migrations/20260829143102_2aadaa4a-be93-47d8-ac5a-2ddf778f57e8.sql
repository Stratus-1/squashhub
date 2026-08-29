CREATE TABLE public.sportyhq_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  person_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  last_status text,
  last_message text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_member_id)
);

GRANT SELECT ON public.sportyhq_lookup_attempts TO authenticated;
GRANT ALL ON public.sportyhq_lookup_attempts TO service_role;

ALTER TABLE public.sportyhq_lookup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own sportyhq lookup attempts"
  ON public.sportyhq_lookup_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = sportyhq_lookup_attempts.club_member_id
        AND cm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER update_sportyhq_lookup_attempts_updated_at
  BEFORE UPDATE ON public.sportyhq_lookup_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();