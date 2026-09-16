ALTER TABLE public.fema_productos
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'ARS';
ALTER TABLE public.fema_productos
  DROP CONSTRAINT IF EXISTS fema_productos_moneda_check;
ALTER TABLE public.fema_productos
  ADD CONSTRAINT fema_productos_moneda_check CHECK (moneda IN ('ARS','USD'));