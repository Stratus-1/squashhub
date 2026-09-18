DROP POLICY IF EXISTS "Authenticated can read whatsapp templates"
  ON public.whatsapp_templates;

DROP POLICY IF EXISTS "Platform admins can read whatsapp templates"
  ON public.whatsapp_templates;

CREATE POLICY "Platform admins can read whatsapp templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));