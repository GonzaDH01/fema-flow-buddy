ALTER TABLE public.fema_cuentas_bancarias
  ADD COLUMN IF NOT EXISTS tipo_cuenta text NOT NULL DEFAULT 'vista',
  ADD COLUMN IF NOT EXISTS rescate text;

ALTER TABLE public.fema_cuentas_bancarias
  DROP CONSTRAINT IF EXISTS fema_cuentas_tipo_check;
ALTER TABLE public.fema_cuentas_bancarias
  ADD CONSTRAINT fema_cuentas_tipo_check CHECK (tipo_cuenta IN ('vista','fondo'));

CREATE TABLE IF NOT EXISTS public.fema_mov_fondos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  origen_id uuid REFERENCES public.fema_cuentas_bancarias(id) ON DELETE SET NULL,
  destino_id uuid REFERENCES public.fema_cuentas_bancarias(id) ON DELETE SET NULL,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  observaciones text,
  anio integer NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE),
  mes integer NOT NULL DEFAULT EXTRACT(month FROM CURRENT_DATE),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_mov_fondos TO authenticated;
GRANT ALL ON public.fema_mov_fondos TO service_role;

ALTER TABLE public.fema_mov_fondos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fondos_shared_select" ON public.fema_mov_fondos FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "fondos_shared_insert" ON public.fema_mov_fondos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "fondos_shared_update" ON public.fema_mov_fondos FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "fondos_shared_delete" ON public.fema_mov_fondos FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER fema_fondos_set_updated_at BEFORE UPDATE ON public.fema_mov_fondos
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

UPDATE public.fema_cuentas_bancarias SET tipo_cuenta = 'vista' WHERE tipo_cuenta IS NULL OR tipo_cuenta = '';

INSERT INTO public.fema_cuentas_bancarias (user_id, banco, alias, saldo, tipo_cuenta, rescate, activa)
SELECT c.user_id, 'Galicia', v.alias, 0, 'fondo', v.rescate, true
FROM (SELECT user_id FROM public.fema_cuentas_bancarias ORDER BY created_at LIMIT 1) c
CROSS JOIN (VALUES ('FIMA Premium','inmediato'), ('FIMA Renta en Pesos','24hs')) AS v(alias, rescate)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fema_cuentas_bancarias x WHERE x.alias = v.alias
);