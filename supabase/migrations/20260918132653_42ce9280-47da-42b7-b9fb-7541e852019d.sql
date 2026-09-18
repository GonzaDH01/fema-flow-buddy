CREATE POLICY "doc_compras_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-compras' AND public.is_approved(auth.uid()));
CREATE POLICY "doc_compras_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-compras' AND public.is_approved(auth.uid()));
CREATE POLICY "doc_compras_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documentos-compras' AND public.is_approved(auth.uid()))
  WITH CHECK (bucket_id = 'documentos-compras' AND public.is_approved(auth.uid()));
CREATE POLICY "doc_compras_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-compras' AND public.is_approved(auth.uid()));