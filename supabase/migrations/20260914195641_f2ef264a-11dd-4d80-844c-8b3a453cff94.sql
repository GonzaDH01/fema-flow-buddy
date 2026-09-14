CREATE POLICY "empleados_doc_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'empleados-doc' AND public.is_approved(auth.uid()));
CREATE POLICY "empleados_doc_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'empleados-doc' AND public.is_approved(auth.uid()));
CREATE POLICY "empleados_doc_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'empleados-doc' AND public.is_approved(auth.uid()))
  WITH CHECK (bucket_id = 'empleados-doc' AND public.is_approved(auth.uid()));
CREATE POLICY "empleados_doc_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'empleados-doc' AND public.is_approved(auth.uid()));