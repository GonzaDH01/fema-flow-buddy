ALTER TABLE public.fema_planillas_bolsero
  ADD COLUMN IF NOT EXISTS establecimiento text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS cliente_nombre text,
  ADD COLUMN IF NOT EXISTS bolsas numeric[] NOT NULL DEFAULT '{}';

ALTER TABLE public.fema_planilla_equipos
  ADD COLUMN IF NOT EXISTS chofer text,
  ADD COLUMN IF NOT EXISTS dominio text,
  ADD COLUMN IF NOT EXISTS es_tercero boolean NOT NULL DEFAULT false;