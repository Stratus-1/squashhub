
DROP POLICY IF EXISTS "Platform admins can read all settings" ON public.app_settings;
CREATE POLICY "Platform admins can read all settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can insert settings" ON public.app_settings;
CREATE POLICY "Platform admins can insert settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can update settings" ON public.app_settings;
CREATE POLICY "Platform admins can update settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can delete settings" ON public.app_settings;
CREATE POLICY "Platform admins can delete settings"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
