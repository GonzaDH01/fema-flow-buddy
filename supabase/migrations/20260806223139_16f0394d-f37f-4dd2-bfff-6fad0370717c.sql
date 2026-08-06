CREATE TABLE public.fema_imputaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factura_venta_id uuid REFERENCES public.fema_facturas_venta(id) ON DELETE SET NULL,
  factura_compra_id uuid REFERENCES public.fema_facturas_compra(id) ON DELETE SET NULL,
  movimiento_pago_id uuid NOT NULL REFERENCES public.fema_movimientos_pago(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto >= 0),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_imputaciones TO authenticated;
GRANT ALL ON public.fema_imputaciones TO service_role;

ALTER TABLE public.fema_imputaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan sus propias imputaciones"
ON public.fema_imputaciones
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_fema_imputaciones_user ON public.fema_imputaciones(user_id);
CREATE INDEX idx_fema_imputaciones_fv ON public.fema_imputaciones(factura_venta_id);
CREATE INDEX idx_fema_imputaciones_fc ON public.fema_imputaciones(factura_compra_id);
CREATE INDEX idx_fema_imputaciones_mov ON public.fema_imputaciones(movimiento_pago_id);