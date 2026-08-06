ALTER TABLE public.fema_imputaciones ADD COLUMN IF NOT EXISTS anio integer;
ALTER TABLE public.fema_imputaciones ADD COLUMN IF NOT EXISTS mes integer;

UPDATE public.fema_imputaciones SET anio = EXTRACT(YEAR FROM fecha)::int, mes = EXTRACT(MONTH FROM fecha)::int WHERE anio IS NULL OR mes IS NULL;

COMMENT ON COLUMN public.fema_imputaciones.anio IS 'Año de la imputación, derivado de fecha';
COMMENT ON COLUMN public.fema_imputaciones.mes IS 'Mes de la imputación, derivado de fecha';