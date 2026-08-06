
CREATE OR REPLACE VIEW public.fema_v_saldos_compra
WITH (security_invoker = true) AS
SELECT
  f.id AS factura_id,
  f.user_id,
  f.total,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado IN ('pagado','cedido')), 0) AS pagado,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'en_cartera'), 0) AS programado,
  GREATEST(f.total
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado IN ('pagado','cedido')), 0)
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'en_cartera'), 0), 0) AS saldo,
  COUNT(m.id) FILTER (WHERE m.estado = 'en_cartera') AS docs_programados,
  MIN(m.vencimiento) FILTER (WHERE m.estado = 'en_cartera') AS proximo_vencimiento
FROM public.fema_facturas_compra f
LEFT JOIN public.fema_movimientos_pago m ON m.factura_compra_id = f.id
GROUP BY f.id, f.user_id, f.total;

CREATE OR REPLACE VIEW public.fema_v_saldos_venta
WITH (security_invoker = true) AS
SELECT
  f.id AS factura_id,
  f.user_id,
  f.total,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'cobrado'), 0) AS cobrado,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado IN ('en_cartera','pendiente')), 0) AS programado,
  GREATEST(f.total
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'cobrado'), 0)
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado IN ('en_cartera','pendiente')), 0), 0) AS saldo,
  COUNT(m.id) FILTER (WHERE m.estado IN ('en_cartera','pendiente')) AS docs_programados,
  MIN(m.vencimiento) FILTER (WHERE m.estado IN ('en_cartera','pendiente')) AS proximo_vencimiento
FROM public.fema_facturas_venta f
LEFT JOIN public.fema_movimientos_pago m ON m.factura_venta_id = f.id
GROUP BY f.id, f.user_id, f.total;

GRANT SELECT ON public.fema_v_saldos_compra TO authenticated;
GRANT SELECT ON public.fema_v_saldos_venta TO authenticated;
