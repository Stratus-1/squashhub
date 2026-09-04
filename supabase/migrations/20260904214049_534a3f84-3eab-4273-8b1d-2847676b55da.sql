CREATE TABLE public.club_association_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  association_tenant_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  invoice_number text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
  emailed_at timestamptz,
  emailed_to text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_tenant_id, club_id, season_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_invoices TO authenticated;
GRANT ALL ON public.club_association_invoices TO service_role;

ALTER TABLE public.club_association_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club finance can view own affiliation invoices"
ON public.club_association_invoices FOR SELECT TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));

CREATE POLICY "Association admins manage issued invoices"
ON public.club_association_invoices FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), association_tenant_id))
WITH CHECK (public.is_club_admin(auth.uid(), association_tenant_id));

CREATE TRIGGER trg_cai_updated_at
BEFORE UPDATE ON public.club_association_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cai_club ON public.club_association_invoices(club_id, season_year);
CREATE INDEX idx_cai_tenant ON public.club_association_invoices(association_tenant_id, season_year);

CREATE TABLE public.club_association_invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.club_association_invoices(id) ON DELETE CASCADE,
  fee_item_id uuid,
  label text NOT NULL,
  basis text NOT NULL,
  unit_amount numeric(12,2) NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_invoice_lines TO authenticated;
GRANT ALL ON public.club_association_invoice_lines TO service_role;

ALTER TABLE public.club_association_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club finance can view own affiliation invoice lines"
ON public.club_association_invoice_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_association_invoices i
  WHERE i.id = invoice_id AND public.is_club_admin_or_permitted(auth.uid(), i.club_id, 'fees')
));

CREATE POLICY "Association admins manage issued invoice lines"
ON public.club_association_invoice_lines FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_association_invoices i
  WHERE i.id = invoice_id AND public.is_club_admin(auth.uid(), i.association_tenant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_association_invoices i
  WHERE i.id = invoice_id AND public.is_club_admin(auth.uid(), i.association_tenant_id)
));

CREATE TRIGGER trg_cail_updated_at
BEFORE UPDATE ON public.club_association_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cail_invoice ON public.club_association_invoice_lines(invoice_id);

CREATE OR REPLACE FUNCTION public.generate_club_association_invoice(
  _club_id uuid, _season_year integer)
RETURNS TABLE(invoice_id uuid, invoice_number text, total numeric, line_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_invoice_id uuid;
  v_number text;
  v_total numeric(12,2) := 0;
  v_lines integer := 0;
  v_seq integer;
BEGIN
  SELECT aac.association_tenant_id INTO v_tenant
  FROM public.association_affiliated_clubs aac
  WHERE aac.club_id = _club_id AND aac.status = 'active'
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.is_club_admin(auth.uid(), v_tenant)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT i.id, i.invoice_number INTO v_invoice_id, v_number
  FROM public.club_association_invoices i
  WHERE i.association_tenant_id = v_tenant AND i.club_id = _club_id AND i.season_year = _season_year;

  IF v_invoice_id IS NULL THEN
    SELECT count(*) + 1 INTO v_seq
    FROM public.club_association_invoices i
    WHERE i.association_tenant_id = v_tenant AND i.season_year = _season_year;

    v_number := 'INV-' || _season_year::text || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.club_association_invoices
      (association_tenant_id, club_id, season_year, invoice_number)
    VALUES (v_tenant, _club_id, _season_year, v_number)
    RETURNING id INTO v_invoice_id;
  ELSE
    DELETE FROM public.club_association_invoice_lines WHERE club_association_invoice_lines.invoice_id = v_invoice_id;
  END IF;

  INSERT INTO public.club_association_invoice_lines
    (invoice_id, fee_item_id, label, basis, unit_amount, units, amount)
  SELECT v_invoice_id, s.fee_item_id, s.label, s.basis, s.amount, s.units_submitted, s.total_submitted
  FROM public.club_association_statement(_club_id, _season_year) s
  WHERE s.units_submitted > 0;

  GET DIAGNOSTICS v_lines = ROW_COUNT;

  SELECT COALESCE(sum(l.amount), 0) INTO v_total
  FROM public.club_association_invoice_lines l
  WHERE l.invoice_id = v_invoice_id;

  UPDATE public.club_association_invoices
  SET total_amount = v_total, issued_at = now()
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_number, v_total, v_lines;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_club_association_invoice(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_club_association_invoice(uuid, integer) TO authenticated, service_role;