ALTER TABLE public.platform_subscription_invoices
  ADD COLUMN IF NOT EXISTS eft_proof_path text,
  ADD COLUMN IF NOT EXISTS eft_proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS eft_proof_uploaded_by uuid;

CREATE OR REPLACE FUNCTION public.submit_platform_invoice_eft_proof(_invoice_id uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.platform_subscription_invoices WHERE id = _invoice_id;
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
         updated_at = now()
   WHERE id = _invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Club admins upload club payment proofs" ON storage.objects;
CREATE POLICY "Club admins upload club payment proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);