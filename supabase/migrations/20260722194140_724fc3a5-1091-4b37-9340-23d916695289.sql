ALTER TYPE public.categoria_compra ADD VALUE IF NOT EXISTS 'Mano_de_Obra';
ALTER TYPE public.categoria_compra ADD VALUE IF NOT EXISTS 'Franco_Particular';
ALTER TABLE public.fema_facturas_venta ADD COLUMN IF NOT EXISTS categoria text;