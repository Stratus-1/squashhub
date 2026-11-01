CREATE TABLE public.champ_device_reservations (
 match_id uuid PRIMARY KEY REFERENCES public.club_champs_matches(id),
 club_id uuid NOT NULL REFERENCES public.clubs(id),
 session_id uuid NOT NULL UNIQUE,
 owner_user_id uuid,
 owner_access_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
GRANT ALL ON public.champ_device_reservations TO service_role;
ALTER TABLE public.champ_device_reservations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.champ_device_reservations IS 'Private explicit device-scoring ownership; no heartbeat expiry or client writes. No existing matches enrolled.';
CREATE TABLE public.champ_device_write_context (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 match_id uuid NOT NULL,
 session_id uuid NOT NULL
);
GRANT ALL ON public.champ_device_write_context TO service_role;
ALTER TABLE public.champ_device_write_context ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.champ_device_write_context IS 'Private transaction authority for future validated device sync; not a client-settable flag.';
CREATE OR REPLACE FUNCTION public._champ_device_assert_write(p_match uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM champ_device_reservations r WHERE r.match_id=p_match AND r.revoked_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM champ_device_write_context c WHERE c.match_id=r.match_id AND c.session_id=r.session_id AND c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current())) THEN
   RAISE EXCEPTION 'This match is reserved for device scoring. Use the owning device or an authorised handover.' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public._champ_device_assert_write(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_champ_device_reserved_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public._champ_device_assert_write(OLD.id);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_champ_device_reserved_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_guard_champ_device_reserved_write
 BEFORE UPDATE OR DELETE ON public.club_champs_matches
 FOR EACH ROW EXECUTE FUNCTION public.guard_champ_device_reserved_write();
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.save_marker_match_result(uuid,uuid,uuid,uuid,uuid,text,text,integer,boolean,text,uuid)'::regprocedure) INTO d;
 IF strpos(d,'SELECT id INTO _existing FROM public.matches WHERE id = _match_id;')=0 THEN
  RAISE EXCEPTION 'Canonical marker result writer changed; review before adding reservation guard';
 END IF;
 d:=replace(d,'SELECT id INTO _existing FROM public.matches WHERE id = _match_id;',
 'IF _tournament_match_id IS NOT NULL THEN
    PERFORM 1 FROM public.club_champs_matches WHERE id=_tournament_match_id FOR UPDATE;
    PERFORM public._champ_device_assert_write(_tournament_match_id);
  END IF;
  SELECT id INTO _existing FROM public.matches WHERE id = _match_id;');
 EXECUTE d;
END $$;