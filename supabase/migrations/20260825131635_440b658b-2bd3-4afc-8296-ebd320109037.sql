CREATE TABLE public.fema_bonos_campana (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  campana text NOT NULL,
  anio integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
  hectareas numeric NOT NULL DEFAULT 0,
  metros_bolsa numeric NOT NULL DEFAULT 0,
  criterio text NOT NULL DEFAULT 'por_hectarea',
  valor_ha numeric NOT NULL DEFAULT 0,
  valor_metro numeric NOT NULL DEFAULT 0,
  porcentaje numeric NOT NULL DEFAULT 0,
  base_facturado numeric NOT NULL DEFAULT 0,
  monto_fijo numeric NOT NULL DEFAULT 0,
  monto_total numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'pendiente',
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_bonos_campana TO authenticated;
GRANT ALL ON public.fema_bonos_campana TO service_role;

ALTER TABLE public.fema_bonos_campana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aprobados ven bonos" ON public.fema_bonos_campana
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Aprobados crean bonos" ON public.fema_bonos_campana
  FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Aprobados editan bonos" ON public.fema_bonos_campana
  FOR UPDATE TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()));
CREATE POLICY "Aprobados borran bonos" ON public.fema_bonos_campana
  FOR DELETE TO authenticated USING (public.is_approved(auth.uid()));

CREATE TRIGGER fema_bonos_campana_updated_at BEFORE UPDATE ON public.fema_bonos_campana
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

ALTER TABLE public.fema_pagos_empleado ADD COLUMN IF NOT EXISTS bono_id uuid REFERENCES public.fema_bonos_campana(id) ON DELETE SET NULL;
