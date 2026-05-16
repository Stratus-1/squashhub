INSERT INTO storage.buckets (id, name, public) VALUES ('bar-items', 'bar-items', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view bar items" ON storage.objects FOR SELECT USING (bucket_id = 'bar-items');
CREATE POLICY "Authenticated can upload bar items" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bar-items');
CREATE POLICY "Authenticated can update bar items" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bar-items');
CREATE POLICY "Authenticated can delete bar items" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bar-items');