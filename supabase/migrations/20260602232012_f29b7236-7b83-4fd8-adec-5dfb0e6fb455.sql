ALTER TABLE public.fema_facturas_venta
  ADD COLUMN IF NOT EXISTS tipo_comprobante text DEFAULT 'Factura',
  ADD COLUMN IF NOT EXISTS trabajo text,
  ADD COLUMN IF NOT EXISTS cultivo text,
  ADD COLUMN IF NOT EXISTS hectareas numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_ha numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metros_bolsa numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_metro numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_cobro date,
  ADD COLUMN IF NOT EXISTS forma_cobro text,
  ADD COLUMN IF NOT EXISTS observaciones text;