
-- Allow anonymous landing page to read delegate names
ALTER VIEW public.club_delegates_public SET (security_invoker = false);
GRANT SELECT ON public.club_delegates_public TO anon, authenticated;

-- Allow anonymous landing page to read registration fees flagged for landing
CREATE POLICY "Public can view national fees flagged for landing"
ON public.national_body_fees
FOR SELECT
TO anon, authenticated
USING (show_on_landing = true);

GRANT SELECT ON public.national_body_fees TO anon;
