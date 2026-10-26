CREATE TABLE public.fema_cc_gonzalo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL CHECK (tipo IN ('gasto_gonzalo','pago_empresa','reintegro_empresa','devolucion_gonzalo')),
  concepto text NOT NULL,
  proveedor text,
  importe numeric NOT NULL CHECK (importe > 0),
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_cc_gonzalo TO authenticated;
GRANT ALL ON public.fema_cc_gonzalo TO service_role;
ALTER TABLE public.fema_cc_gonzalo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccg_select ON public.fema_cc_gonzalo FOR SELECT TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY ccg_insert ON public.fema_cc_gonzalo FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND (is_approved(auth.uid()) OR has_role(auth.uid(),'admin')));
CREATE POLICY ccg_update ON public.fema_cc_gonzalo FOR UPDATE TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin')) WITH CHECK (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY ccg_delete ON public.fema_cc_gonzalo FOR DELETE TO authenticated USING (is_approved(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE TRIGGER ccg_updated BEFORE UPDATE ON public.fema_cc_gonzalo FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();