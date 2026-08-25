CREATE TABLE public.fema_solicitudes_factura_empleado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  periodo_desde date,
  periodo_hasta date,
  total numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'pendiente',
  factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL,
  observaciones text,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_solicitudes_factura_empleado TO authenticated;
GRANT ALL ON public.fema_solicitudes_factura_empleado TO service_role;
ALTER TABLE public.fema_solicitudes_factura_empleado ENABLE ROW LEVEL SECURITY;

CREATE POLICY fema_solf_shared_select ON public.fema_solicitudes_factura_empleado FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_solf_shared_insert ON public.fema_solicitudes_factura_empleado FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY fema_solf_shared_update ON public.fema_solicitudes_factura_empleado FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_solf_shared_delete ON public.fema_solicitudes_factura_empleado FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER fema_solf_updated_at BEFORE UPDATE ON public.fema_solicitudes_factura_empleado
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE TABLE public.fema_pagos_empleado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  periodo_desde date,
  periodo_hasta date,
  modalidad text NOT NULL DEFAULT 'semanal',
  tareas text,
  horas numeric NOT NULL DEFAULT 0,
  monto numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'pendiente',
  forma_pago text,
  observaciones text,
  solicitud_id uuid REFERENCES public.fema_solicitudes_factura_empleado(id) ON DELETE SET NULL,
  anio integer,
  mes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_pagos_empleado TO authenticated;
GRANT ALL ON public.fema_pagos_empleado TO service_role;
ALTER TABLE public.fema_pagos_empleado ENABLE ROW LEVEL SECURITY;

CREATE POLICY fema_pagoemp_shared_select ON public.fema_pagos_empleado FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_pagoemp_shared_insert ON public.fema_pagos_empleado FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY fema_pagoemp_shared_update ON public.fema_pagos_empleado FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY fema_pagoemp_shared_delete ON public.fema_pagos_empleado FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER fema_pagoemp_updated_at BEFORE UPDATE ON public.fema_pagos_empleado
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

CREATE INDEX idx_fema_pagos_empleado_emp ON public.fema_pagos_empleado(empleado_id, fecha);
CREATE INDEX idx_fema_pagos_empleado_sol ON public.fema_pagos_empleado(solicitud_id);

ALTER TABLE public.fema_facturas_compra
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE SET NULL;