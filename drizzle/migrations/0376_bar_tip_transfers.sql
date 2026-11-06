CREATE TABLE public.bar_tip_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  from_staff_id uuid NOT NULL REFERENCES public.bar_counter_devices(id),
  from_staff_name text NOT NULL,
  to_staff_id uuid NOT NULL REFERENCES public.bar_counter_devices(id),
  to_staff_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_staff_id <> to_staff_id)
);
GRANT SELECT ON public.bar_tip_transfers TO authenticated;
GRANT ALL ON public.bar_tip_transfers TO service_role;
ALTER TABLE public.bar_tip_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_tip_transfers_read ON public.bar_tip_transfers FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar') OR public.has_club_permission(auth.uid(), club_id, 'finance') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE VIEW public.bar_staff_tip_earnings WITH (security_invoker=true) AS
 SELECT t.id, t.club_id, t.staff_id, t.staff_name, t.amount, t.status, t.created_at, t.earned_at
   FROM public.bar_tips t WHERE t.work_shift_id IS NULL
UNION ALL
 SELECT a.id, a.club_id, a.staff_id, a.staff_name, a.amount, t.status, a.created_at, t.earned_at
   FROM public.bar_shift_tip_allocations a JOIN public.bar_tips t ON t.id = a.tip_id
UNION ALL
 SELECT x.id, x.club_id, x.from_staff_id, x.from_staff_name, (-x.amount)::numeric(12,2), 'earned'::text, x.created_at, x.created_at
   FROM public.bar_tip_transfers x
UNION ALL
 SELECT x.id, x.club_id, x.to_staff_id, x.to_staff_name, x.amount, 'earned'::text, x.created_at, x.created_at
   FROM public.bar_tip_transfers x;

CREATE OR REPLACE FUNCTION public.bar_transfer_staff_tips(_club_id uuid, _from uuid, _to uuid, _amount numeric, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE fn text; tn text; available numeric; new_id uuid; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT public.chairman_financial_write_allowed(_club_id) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  PERFORM public._bar_tip_authorise(_club_id, NULL);
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount,2) THEN RAISE EXCEPTION 'Enter a valid amount'; END IF;
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'Choose two different staff members'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
  SELECT label INTO fn FROM bar_counter_devices WHERE id=_from AND club_id=_club_id FOR UPDATE;
  SELECT label INTO tn FROM bar_counter_devices WHERE id=_to AND club_id=_club_id AND active FOR UPDATE;
  IF fn IS NULL OR tn IS NULL THEN RAISE EXCEPTION 'Staff not found'; END IF;
  SELECT coalesce((SELECT sum(amount) FROM bar_staff_tip_earnings WHERE club_id=_club_id AND staff_id=_from AND status='earned'),0)
       - coalesce((SELECT sum(amount) FROM bar_tip_payouts WHERE club_id=_club_id AND staff_id=_from),0) INTO available;
  IF _amount > available THEN RAISE EXCEPTION 'Only R% of unpaid tips available to move', round(available,2); END IF;
  INSERT INTO bar_tip_transfers(club_id,from_staff_id,from_staff_name,to_staff_id,to_staff_name,amount,reason,created_by)
  VALUES (_club_id,_from,fn,_to,tn,_amount,btrim(_reason),auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.bar_transfer_staff_tips(uuid,uuid,uuid,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bar_transfer_staff_tips(uuid,uuid,uuid,numeric,text) TO authenticated;