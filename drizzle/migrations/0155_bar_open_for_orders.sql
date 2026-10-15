ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS bar_orders_open_until timestamptz;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS bar_orders_opened_by text;

CREATE OR REPLACE FUNCTION public.bar_accepting_orders(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT bar_order_process_enabled AND bar_orders_open_until IS NOT NULL AND bar_orders_open_until > now()
    FROM public.clubs WHERE id = _club_id), false);
$$;
GRANT EXECUTE ON FUNCTION public.bar_accepting_orders(uuid) TO anon, authenticated;

-- Counter person opens/closes the bar for phone orders. Opening lasts 12h max so a forgotten bar closes itself.
CREATE OR REPLACE FUNCTION public.bar_counter_set_open(_open boolean, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL, _operator text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  UPDATE public.clubs SET
    bar_orders_open_until = CASE WHEN _open THEN now() + interval '12 hours' ELSE NULL END,
    bar_orders_opened_by = CASE WHEN _open THEN NULLIF(left(btrim(COALESCE(_operator,'')),60),'') ELSE NULL END
  WHERE id = v_club;
  RETURN jsonb_build_object('open', _open);
END; $$;
GRANT EXECUTE ON FUNCTION public.bar_counter_set_open(boolean, uuid, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bar_counter_open_state(_token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid; c record;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT bar_orders_open_until, bar_orders_opened_by INTO c FROM public.clubs WHERE id = v_club;
  RETURN jsonb_build_object('open', c.bar_orders_open_until IS NOT NULL AND c.bar_orders_open_until > now(),
    'open_until', c.bar_orders_open_until, 'opened_by', c.bar_orders_opened_by);
END; $$;
GRANT EXECUTE ON FUNCTION public.bar_counter_open_state(uuid, uuid) TO anon, authenticated;

-- Server-side guard: no new phone order unless the bar has been opened.
CREATE OR REPLACE FUNCTION public.bar_orders_require_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.bar_accepting_orders(NEW.club_id) THEN
    RAISE EXCEPTION 'The bar is closed for orders right now';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS bar_orders_require_open ON public.bar_orders;
CREATE TRIGGER bar_orders_require_open BEFORE INSERT ON public.bar_orders FOR EACH ROW EXECUTE FUNCTION public.bar_orders_require_open();