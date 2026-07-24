
ALTER TABLE public.fema_facturas_compra ADD COLUMN IF NOT EXISTS imagen_path TEXT;
ALTER TABLE public.fema_facturas_venta  ADD COLUMN IF NOT EXISTS imagen_path TEXT;

-- Storage policies for facturas-img bucket (approved users share access)
DROP POLICY IF EXISTS "facturas_img_select" ON storage.objects;
DROP POLICY IF EXISTS "facturas_img_insert" ON storage.objects;
DROP POLICY IF EXISTS "facturas_img_delete" ON storage.objects;

CREATE POLICY "facturas_img_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'facturas-img' AND public.is_approved(auth.uid()));

CREATE POLICY "facturas_img_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'facturas-img' AND public.is_approved(auth.uid()));

CREATE POLICY "facturas_img_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'facturas-img' AND public.is_approved(auth.uid()));
