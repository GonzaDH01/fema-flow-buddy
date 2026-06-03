-- Extend fema_presupuestos with full quote fields
ALTER TABLE public.fema_presupuestos
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS descuento_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_monto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_21 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_105 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliente_nombre text,
  ADD COLUMN IF NOT EXISTS cliente_cuit text,
  ADD COLUMN IF NOT EXISTS cliente_domicilio text,
  ADD COLUMN IF NOT EXISTS cliente_localidad text,
  ADD COLUMN IF NOT EXISTS cliente_cond_iva text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS condicion_pago text,
  ADD COLUMN IF NOT EXISTS consideraciones text,
  ADD COLUMN IF NOT EXISTS anio integer;

-- Items table
CREATE TABLE IF NOT EXISTS public.fema_presupuesto_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  presupuesto_id uuid NOT NULL REFERENCES public.fema_presupuestos(id) ON DELETE CASCADE,
  codigo text,
  descripcion text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  alicuota_iva numeric NOT NULL DEFAULT 21,
  subtotal numeric NOT NULL DEFAULT 0,
  orden integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_presupuesto_items TO authenticated;
GRANT ALL ON public.fema_presupuesto_items TO service_role;

ALTER TABLE public.fema_presupuesto_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fema_pre_items_own" ON public.fema_presupuesto_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fema_pre_items_presupuesto ON public.fema_presupuesto_items(presupuesto_id);