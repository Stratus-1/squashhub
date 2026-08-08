GRANT SELECT ON public.app_settings TO anon;
CREATE POLICY "Public can read saas pricing settings"
ON public.app_settings FOR SELECT TO anon
USING (key LIKE 'saas_%');