CREATE TABLE public.fema_doc_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo_documento text NOT NULL DEFAULT 'Pagaré',
  numero text,
  proveedor_id uuid REFERENCES public.fema_proveedores(id) ON DELETE SET NULL,
  proveedor_nombre text,
  bien_descripcion text NOT NULL,
  activo_id uuid REFERENCES public.fema_activos(id) ON DELETE SET NULL,
  moneda text NOT NULL DEFAULT 'ARS',
  cotizacion_usd numeric,
  monto_total numeric NOT NULL DEFAULT 0,
  entrega numeric NOT NULL DEFAULT 0,
  cantidad_cuotas integer NOT NULL DEFAULT 1,
  forma_pago text,
  estado text NOT NULL DEFAULT 'vigente',
  factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL,
  observaciones text,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_doc_compras TO authenticated;
GRANT ALL ON public.fema_doc_compras TO service_role;
ALTER TABLE public.fema_doc_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_compras_select" ON public.fema_doc_compras FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "doc_compras_insert" ON public.fema_doc_compras FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "doc_compras_update" ON public.fema_doc_compras FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));
CREATE POLICY "doc_compras_delete" ON public.fema_doc_compras FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));

CREATE TRIGGER fema_doc_compras_updated_at BEFORE UPDATE ON public.fema_doc_compras
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_doc_compra_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  doc_id uuid NOT NULL REFERENCES public.fema_doc_compras(id) ON DELETE CASCADE,
  numero_cuota integer NOT NULL DEFAULT 1,
  numero_pagare text,
  fecha_vencimiento date NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'ARS',
  estado text NOT NULL DEFAULT 'pendiente',
  fecha_pago date,
  forma_pago text,
  cuenta_id uuid REFERENCES public.fema_cuentas_bancarias(id) ON DELETE SET NULL,
  movimiento_pago_id uuid REFERENCES public.fema_movimientos_pago(id) ON DELETE SET NULL,
  imagen_path text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_doc_compra_cuotas TO authenticated;
GRANT ALL ON public.fema_doc_compra_cuotas TO service_role;
ALTER TABLE public.fema_doc_compra_cuotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_cuotas_select" ON public.fema_doc_compra_cuotas FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "doc_cuotas_insert" ON public.fema_doc_compra_cuotas FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "doc_cuotas_update" ON public.fema_doc_compra_cuotas FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));
CREATE POLICY "doc_cuotas_delete" ON public.fema_doc_compra_cuotas FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));

CREATE INDEX idx_doc_cuotas_doc ON public.fema_doc_compra_cuotas(doc_id);
CREATE INDEX idx_doc_cuotas_venc ON public.fema_doc_compra_cuotas(fecha_vencimiento);

CREATE TRIGGER fema_doc_cuotas_updated_at BEFORE UPDATE ON public.fema_doc_compra_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_doc_compra_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  doc_id uuid NOT NULL REFERENCES public.fema_doc_compras(id) ON DELETE CASCADE,
  cuota_id uuid REFERENCES public.fema_doc_compra_cuotas(id) ON DELETE CASCADE,
  path text NOT NULL,
  nombre_archivo text,
  es_documento boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_doc_compra_archivos TO authenticated;
GRANT ALL ON public.fema_doc_compra_archivos TO service_role;
ALTER TABLE public.fema_doc_compra_archivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_arch_select" ON public.fema_doc_compra_archivos FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "doc_arch_insert" ON public.fema_doc_compra_archivos FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "doc_arch_update" ON public.fema_doc_compra_archivos FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));
CREATE POLICY "doc_arch_delete" ON public.fema_doc_compra_archivos FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));

CREATE INDEX idx_doc_arch_doc ON public.fema_doc_compra_archivos(doc_id);