CREATE OR REPLACE FUNCTION public.submit_platform_invoice_eft_proof(_invoice_id uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_invoice_number text;
  v_club_name text;
BEGIN
  SELECT i.club_id, i.invoice_number, c.name
    INTO v_club, v_invoice_number, v_club_name
    FROM public.platform_subscription_invoices i
    JOIN public.clubs c ON c.id = i.club_id
   WHERE i.id = _invoice_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF NOT (public.is_club_admin(auth.uid(), v_club) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised for this invoice';
  END IF;
  IF _path IS NULL OR btrim(_path) = '' THEN
    RAISE EXCEPTION 'Proof path required';
  END IF;

  UPDATE public.platform_subscription_invoices
     SET eft_proof_path = _path,
         eft_proof_uploaded_at = now(),
         eft_proof_uploaded_by = auth.uid(),
         eft_review_status = 'pending',
         eft_reviewed_at = NULL,
         eft_reviewed_by = NULL,
         eft_review_note = NULL,
         updated_at = now()
   WHERE id = _invoice_id;

  -- Notify all platform super admins that a proof is awaiting review
  INSERT INTO public.notifications (user_id, title, message, type, read, url, data)
  SELECT ur.user_id,
         'EFT proof to verify',
         coalesce(v_club_name, 'A club') || ' uploaded proof of payment for invoice ' || coalesce(v_invoice_number, _invoice_id::text) || '. Review and approve or reject it.',
         'eft_proof_review',
         false,
         '/admin/subscriptions?status=awaiting_eft',
         jsonb_build_object('invoice_id', _invoice_id, 'club_id', v_club)
    FROM public.user_roles ur
   WHERE ur.role = 'admin'::app_role;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) TO authenticated;