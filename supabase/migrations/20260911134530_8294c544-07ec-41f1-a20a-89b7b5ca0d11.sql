CREATE TABLE public.fema_activos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'Maquinaria',
  marca text,
  modelo text,
  anio integer,
  numero_serie text,
  estado text NOT NULL DEFAULT 'Operativo',
  ubicacion text,
  responsable text,
  valor_compra numeric,
  fecha_compra date,
  mantenimiento text,
  proximo_service date,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_activos TO authenticated;
GRANT ALL ON public.fema_activos TO service_role;
ALTER TABLE public.fema_activos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activos_select" ON public.fema_activos FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "activos_insert" ON public.fema_activos FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "activos_update" ON public.fema_activos FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "activos_delete" ON public.fema_activos FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE TRIGGER fema_activos_updated_at BEFORE UPDATE ON public.fema_activos
FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_activo_imagenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activo_id uuid NOT NULL REFERENCES public.fema_activos(id) ON DELETE CASCADE,
  path text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_activo_imagenes TO authenticated;
GRANT ALL ON public.fema_activo_imagenes TO service_role;
ALTER TABLE public.fema_activo_imagenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activoimg_select" ON public.fema_activo_imagenes FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "activoimg_insert" ON public.fema_activo_imagenes FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "activoimg_update" ON public.fema_activo_imagenes FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "activoimg_delete" ON public.fema_activo_imagenes FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE INDEX idx_activo_imagenes_activo ON public.fema_activo_imagenes(activo_id);

CREATE POLICY "inventario_img_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inventario-img' AND public.is_approved(auth.uid()));
CREATE POLICY "inventario_img_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inventario-img' AND public.is_approved(auth.uid()));
CREATE POLICY "inventario_img_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'inventario-img' AND public.is_approved(auth.uid()));
CREATE POLICY "inventario_img_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inventario-img' AND public.is_approved(auth.uid()));