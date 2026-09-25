ALTER TABLE public.fema_empleados ADD COLUMN IF NOT EXISTS valor_hectarea numeric NOT NULL DEFAULT 0;

CREATE TABLE public.fema_liquidacion_ha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pago_id uuid NOT NULL REFERENCES public.fema_pagos_empleado(id) ON DELETE CASCADE,
  factura_venta_id uuid REFERENCES public.fema_facturas_venta(id) ON DELETE SET NULL,
  empleado_id uuid REFERENCES public.fema_empleados(id) ON DELETE CASCADE,
  hectareas numeric NOT NULL DEFAULT 0,
  valor_ha numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL DEFAULT 0,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_liquidacion_ha TO authenticated;
GRANT ALL ON public.fema_liquidacion_ha TO service_role;

ALTER TABLE public.fema_liquidacion_ha ENABLE ROW LEVEL SECURITY;

CREATE POLICY liquidacion_ha_select ON public.fema_liquidacion_ha FOR SELECT
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY liquidacion_ha_insert ON public.fema_liquidacion_ha FOR INSERT
  WITH CHECK (is_approved(auth.uid()) AND auth.uid() = user_id);
CREATE POLICY liquidacion_ha_update ON public.fema_liquidacion_ha FOR UPDATE
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY liquidacion_ha_delete ON public.fema_liquidacion_ha FOR DELETE
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)));

CREATE INDEX idx_liq_ha_pago ON public.fema_liquidacion_ha(pago_id);
CREATE INDEX idx_liq_ha_factura ON public.fema_liquidacion_ha(factura_venta_id);
CREATE INDEX idx_liq_ha_empleado ON public.fema_liquidacion_ha(empleado_id);

CREATE TRIGGER trg_liq_ha_updated BEFORE UPDATE ON public.fema_liquidacion_ha
  FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();