CREATE TABLE public.club_registration_openings (
 club_id uuid PRIMARY KEY REFERENCES public.clubs(id),
 requester_name text NOT NULL CHECK (length(requester_name) BETWEEN 2 AND 100),
 requester_email text NOT NULL CHECK (length(requester_email) <= 254),
 declared_role text NOT NULL CHECK (declared_role IN ('administrator','chairman')),
 requester_user_id uuid,
 opened_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.club_registration_openings TO authenticated;
GRANT ALL ON public.club_registration_openings TO service_role;
ALTER TABLE public.club_registration_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_read ON public.club_registration_openings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.open_club_registration(_club_id uuid, _name text, _email text, _role text, _confirmed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _confirmed IS DISTINCT FROM true OR _role IS NULL OR _role NOT IN ('administrator','chairman') THEN
  RAISE EXCEPTION 'Please confirm that you are a club administrator or chairman.';
 END IF;
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 2 AND 100 OR _email IS NULL OR length(btrim(_email)) > 254 OR btrim(_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'Please enter your name and a valid email address.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = _club_id AND subdomain IS NOT NULL) THEN
  RAISE EXCEPTION 'Club not found.';
 END IF;
 INSERT INTO public.club_registration_openings(club_id,requester_name,requester_email,declared_role,requester_user_id)
 VALUES (_club_id,btrim(_name),lower(btrim(_email)),_role,auth.uid()) ON CONFLICT (club_id) DO NOTHING;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.open_club_registration(uuid,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_club_registration(uuid,text,text,text,boolean) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.club_accepts_membership_applications(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND (
 c.sla_accepted_at IS NOT NULL
 OR EXISTS (SELECT 1 FROM public.club_subscriptions s WHERE s.club_id = c.id AND s.status IN ('active','trial','trialing') AND s.trial_ends_at > now())
 OR c.id = 'ec323faa-9b1f-4603-9b30-a0db787ada99'::uuid
 OR EXISTS (SELECT 1 FROM public.club_registration_openings o WHERE o.club_id = c.id)
 ));
$$;
REVOKE ALL ON FUNCTION public.club_accepts_membership_applications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_accepts_membership_applications(uuid) TO anon, authenticated, service_role;
COMMENT ON TABLE public.club_registration_openings IS 'Owner-authorized public registration-only opening declarations. No administrator rights, SLA acceptance, subscription activation or billing change.';