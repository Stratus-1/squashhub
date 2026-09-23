GRANT ALL ON public.member_import_staging TO sandbox_exec;
ALTER TABLE public.member_import_staging FORCE ROW LEVEL SECURITY;
CREATE POLICY "sandbox maintenance" ON public.member_import_staging FOR ALL TO sandbox_exec USING (true) WITH CHECK (true);