CREATE TABLE public.qr_short_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bar_item_id uuid REFERENCES public.bar_items(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'item' CHECK (kind IN ('item','venue')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_short_codes_club ON public.qr_short_codes(club_id);
CREATE INDEX idx_qr_short_codes_item ON public.qr_short_codes(bar_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_short_codes TO authenticated;
GRANT ALL ON public.qr_short_codes TO service_role;

ALTER TABLE public.qr_short_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage their QR codes"
ON public.qr_short_codes FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_qr_short_codes_updated_at
BEFORE UPDATE ON public.qr_short_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bar_items ADD COLUMN IF NOT EXISTS barcode text;

CREATE OR REPLACE FUNCTION public.resolve_qr_short_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.qr_short_codes%ROWTYPE;
  v_club record;
  v_item jsonb;
  v_menu jsonb;
BEGIN
  SELECT * INTO v_rec FROM public.qr_short_codes
  WHERE code = _code AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, name, logo_url, subdomain, currency_code, honesty_bar_enabled
    INTO v_club FROM public.clubs WHERE id = v_rec.club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_rec.bar_item_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'image_url', b.image_url,
      'stock_qty', b.stock_qty, 'active', b.active
    ) INTO v_item
    FROM public.bar_items b WHERE b.id = v_rec.bar_item_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'image_url', b.image_url,
      'stock_qty', b.stock_qty
    ) ORDER BY b.sort_order NULLS LAST, b.name), '[]'::jsonb)
    INTO v_menu
    FROM public.bar_items b
    WHERE b.club_id = v_rec.club_id AND b.active = true AND COALESCE(b.stock_qty, 0) > 0;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'kind', v_rec.kind,
    'code', v_rec.code,
    'club', jsonb_build_object(
      'id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url,
      'subdomain', v_club.subdomain, 'currency_code', v_club.currency_code,
      'bar_enabled', COALESCE(v_club.honesty_bar_enabled, false)
    ),
    'item', v_item,
    'menu', v_menu
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_qr_short_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.qr_record_visitor_sale(
  _code text,
  _bar_item_id uuid,
  _quantity integer,
  _visitor_name text,
  _payment_method text DEFAULT 'card',
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.qr_short_codes%ROWTYPE;
  v_item public.bar_items%ROWTYPE;
  v_sale_id uuid;
BEGIN
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 50 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;
  IF _payment_method NOT IN ('card','cash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT * INTO v_rec FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive code'; END IF;

  SELECT * INTO v_item FROM public.bar_items
  WHERE id = _bar_item_id AND club_id = v_rec.club_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

  IF v_rec.bar_item_id IS NOT NULL AND v_rec.bar_item_id <> _bar_item_id THEN
    RAISE EXCEPTION 'Item does not match this code';
  END IF;

  INSERT INTO public.bar_visitor_sales (
    club_id, bar_item_id, quantity, unit_price, total,
    payment_method, visitor_name, note
  ) VALUES (
    v_rec.club_id, v_item.id, _quantity, v_item.price, v_item.price * _quantity,
    _payment_method, NULLIF(trim(COALESCE(_visitor_name, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(_note, '')), '') || ' · ', '') || 'Scan-to-pay (QR)'
  ) RETURNING id INTO v_sale_id;

  RETURN jsonb_build_object('ok', true, 'sale_id', v_sale_id,
    'total', v_item.price * _quantity, 'item_name', v_item.name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.qr_record_visitor_sale(text, uuid, integer, text, text, text) TO anon, authenticated;