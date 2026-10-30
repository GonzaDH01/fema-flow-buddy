CREATE TABLE public.fema_liquidaciones_terceros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  fecha date NOT NULL DEFAULT current_date,
  contratista text NOT NULL,
  contratista_clave text,
  proveedor_id uuid,
  periodo_desde date,
  periodo_hasta date,
  planilla_ids uuid[] NOT NULL DEFAULT '{}',
  equipo_ids uuid[] NOT NULL DEFAULT '{}',
  viajes numeric NOT NULL DEFAULT 0,
  metros numeric NOT NULL DEFAULT 0,
  calculo text NOT NULL DEFAULT 'viaje',
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  conceptos jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_liquidaciones_terceros TO authenticated;
GRANT ALL ON public.fema_liquidaciones_terceros TO service_role;
ALTER TABLE public.fema_liquidaciones_terceros ENABLE ROW LEVEL SECURITY;
CREATE POLICY lt_select ON public.fema_liquidaciones_terceros FOR SELECT TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY lt_insert ON public.fema_liquidaciones_terceros FOR INSERT TO authenticated WITH CHECK (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY lt_update ON public.fema_liquidaciones_terceros FOR UPDATE TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY lt_delete ON public.fema_liquidaciones_terceros FOR DELETE TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE TRIGGER lt_updated BEFORE UPDATE ON public.fema_liquidaciones_terceros FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();