ALTER TABLE public.fema_proveedores
  ADD COLUMN IF NOT EXISTS domicilio text,
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS condicion_iva text,
  ADD COLUMN IF NOT EXISTS iibb text;

ALTER TABLE public.fema_clientes
  ADD COLUMN IF NOT EXISTS domicilio text,
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS condicion_iva text,
  ADD COLUMN IF NOT EXISTS iibb text;