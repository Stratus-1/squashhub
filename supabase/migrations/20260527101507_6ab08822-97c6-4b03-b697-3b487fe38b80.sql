
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_threads  TO authenticated;
GRANT ALL ON public.support_threads  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
