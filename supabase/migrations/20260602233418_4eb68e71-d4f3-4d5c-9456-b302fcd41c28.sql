ALTER TABLE public.fema_facturas_compra
  ADD COLUMN IF NOT EXISTS tipo_comprobante text DEFAULT 'Factura',
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS impuestos_internos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_impuestos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS litros numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS producto text;