CREATE TABLE public.tournament_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  label text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournament_snapshots TO authenticated;
GRANT ALL ON public.tournament_snapshots TO service_role;
ALTER TABLE public.tournament_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read snapshots" ON public.tournament_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.take_tournament_snapshot(_tid uuid, _label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; payload jsonb := '{}'::jsonb; rows jsonb; cid uuid; sid uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT club_id INTO cid FROM tournaments WHERE id = _tid;
  SELECT jsonb_agg(to_jsonb(t)) INTO rows FROM tournaments t WHERE id = _tid;
  payload := payload || jsonb_build_object('tournaments', rows);
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('tournament_id','champ_id')
      AND table_name <> 'tournament_snapshots'
  LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x WHERE %I = $1', r.table_name, r.column_name)
      INTO rows USING _tid;
    payload := payload || jsonb_build_object(r.table_name, rows);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO rows FROM bookings b
    WHERE b.club_id = cid AND (b.external_id LIKE 'sbs:%' OR b.id::text IN (
      SELECT x->>'booking_id' FROM jsonb_array_elements(coalesce(payload->'club_champs_matches','[]'::jsonb)) x));
  payload := payload || jsonb_build_object('bookings', rows);
  SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO rows FROM club_beta_features f WHERE f.club_id = cid;
  payload := payload || jsonb_build_object('club_beta_features', rows);
  INSERT INTO tournament_snapshots(club_id, tournament_id, label, data)
    VALUES (cid, _tid, _label, payload) RETURNING id INTO sid;
  RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.take_tournament_snapshot(uuid, text) FROM PUBLIC, anon;

SELECT public.take_tournament_snapshot('f954222a-0f0a-4d8c-ac7b-9c74042cc69e', 'Uitsig before builder rollout 2026-10-16');