CREATE TABLE public.club_gateway_payout_settings (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  payouts_per_month int NOT NULL DEFAULT 0 CHECK (payouts_per_month IN (0,1,2,4)),
  fee_per_payout numeric NOT NULL DEFAULT 0 CHECK (fee_per_payout >= 0 AND fee_per_payout <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_gateway_payout_settings TO authenticated;
GRANT ALL ON public.club_gateway_payout_settings TO service_role;
ALTER TABLE public.club_gateway_payout_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banking or finance read payout settings" ON public.club_gateway_payout_settings FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking') OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));
CREATE POLICY "Banking manages payout settings" ON public.club_gateway_payout_settings FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'));

-- Posts each scheduled payout fee once (1x: 1st; 2x: 1st & 15th; 4x: 1st, 8th, 15th, 22nd; Johannesburg date)
CREATE OR REPLACE FUNCTION public.post_gateway_payout_fees(_on date DEFAULT (now() AT TIME ZONE 'Africa/Johannesburg')::date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_ref uuid; v_desc text; v_n int := 0; v_day int := extract(day FROM _on);
BEGIN
  FOR r IN SELECT s.* FROM public.club_gateway_payout_settings s
           WHERE s.fee_per_payout > 0 AND (
             (s.payouts_per_month = 1 AND v_day = 1) OR
             (s.payouts_per_month = 2 AND v_day IN (1,15)) OR
             (s.payouts_per_month = 4 AND v_day IN (1,8,15,22))) LOOP
    v_ref := md5(r.club_id::text || ':payout:' || r.provider || ':' || _on::text)::uuid;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = v_ref);
    v_desc := initcap(r.provider) || ' payout fee — ' || to_char(_on, 'DD Mon YYYY');
    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, entry_date)
    VALUES (r.club_id, v_ref, 'gateway_fees'::public.gl_account, r.fee_per_payout, 0, v_desc, _on),
           (r.club_id, v_ref, 'bank_current'::public.gl_account, 0, r.fee_per_payout, v_desc, _on);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.post_gateway_payout_fees(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_gateway_payout_fees(date) TO service_role;