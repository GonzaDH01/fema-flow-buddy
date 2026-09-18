ALTER TABLE public.fema_planillas_bolsero
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'Pendiente',
  ADD COLUMN IF NOT EXISTS factura_venta_id uuid REFERENCES public.fema_facturas_venta(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fema_planillas_bolsero_estado ON public.fema_planillas_bolsero(estado);