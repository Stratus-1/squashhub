ALTER TABLE public.platform_subscription_invoices
  ADD COLUMN IF NOT EXISTS eft_review_status text,
  ADD COLUMN IF NOT EXISTS eft_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS eft_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS eft_review_note text;

-- Mark any already-uploaded proof as awaiting review
UPDATE public.platform_subscription_invoices
   SET eft_review_status = 'pending'
 WHERE eft_proof_uploaded_at IS NOT NULL
   AND eft_review_status IS NULL
   AND status <> 'paid';

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
         eft_review_status = 'pending',
         eft_reviewed_at = NULL,
         eft_reviewed_by = NULL,
         eft_review_note = NULL,
         updated_at = now()
   WHERE id = _invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_platform_invoice_eft_proof(uuid, text) TO authenticated;

-- Platform super admin approves / rejects an EFT proof
CREATE OR REPLACE FUNCTION public.review_platform_invoice_eft_proof(_invoice_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only platform administrators may review EFT payments';
  END IF;

  IF _approve THEN
    UPDATE public.platform_subscription_invoices
       SET eft_review_status = 'approved',
           eft_reviewed_at = now(),
           eft_reviewed_by = auth.uid(),
           eft_review_note = _note,
           status = 'paid',
           paid_at = COALESCE(paid_at, now()),
           updated_at = now()
     WHERE id = _invoice_id;
  ELSE
    UPDATE public.platform_subscription_invoices
       SET eft_review_status = 'rejected',
           eft_reviewed_at = now(),
           eft_reviewed_by = auth.uid(),
           eft_review_note = _note,
           updated_at = now()
     WHERE id = _invoice_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_platform_invoice_eft_proof(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_platform_invoice_eft_proof(uuid, boolean, text) TO authenticated;

-- Platform admins must be able to open the uploaded proof file
DROP POLICY IF EXISTS "Platform admins read payment proofs" ON storage.objects;
CREATE POLICY "Platform admins read payment proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);