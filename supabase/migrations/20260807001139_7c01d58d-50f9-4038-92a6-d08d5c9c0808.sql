CREATE OR REPLACE FUNCTION public.fema_reconciliar_factura(_factura_id uuid, _tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_cubierto numeric;
  v_estado text;
  v_nuevo text;
BEGIN
  IF _factura_id IS NULL THEN RETURN; END IF;

  IF _tipo = 'venta' THEN
    SELECT total, estado::text INTO v_total, v_estado FROM public.fema_facturas_venta WHERE id = _factura_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT COALESCE(SUM(sub.monto), 0) INTO v_cubierto
    FROM (
      SELECT m.monto FROM public.fema_movimientos_pago m
       WHERE m.factura_venta_id = _factura_id AND m.estado = 'cobrado'
      UNION ALL
      SELECT i.monto FROM public.fema_imputaciones i
       WHERE i.factura_venta_id = _factura_id
    ) sub;
    v_nuevo := CASE WHEN COALESCE(v_total,0) > 0 AND v_cubierto >= v_total - 0.01 THEN 'cobrada' ELSE 'pendiente' END;
    IF v_estado IS DISTINCT FROM v_nuevo THEN
      UPDATE public.fema_facturas_venta SET estado = v_nuevo::estado_factura_venta WHERE id = _factura_id;
    END IF;
  ELSE
    SELECT total, estado::text INTO v_total, v_estado FROM public.fema_facturas_compra WHERE id = _factura_id;
    IF NOT FOUND THEN RETURN; END IF;
    -- En compras, un documento propio emitido (echeq/cheque/pagaré en cartera)
    -- ya cancela la deuda con el proveedor: el control del débito queda en Medios de pago.
    SELECT COALESCE(SUM(sub.monto), 0) INTO v_cubierto
    FROM (
      SELECT m.monto FROM public.fema_movimientos_pago m
       WHERE m.factura_compra_id = _factura_id
         AND (m.estado IN ('pagado', 'cedido')
              OR (m.estado = 'en_cartera' AND m.direccion = 'pago'))
      UNION ALL
      SELECT i.monto FROM public.fema_imputaciones i
       WHERE i.factura_compra_id = _factura_id
    ) sub;
    v_nuevo := CASE WHEN COALESCE(v_total,0) > 0 AND v_cubierto >= v_total - 0.01 THEN 'pagada' ELSE 'pendiente' END;
    IF v_estado IS DISTINCT FROM v_nuevo THEN
      UPDATE public.fema_facturas_compra SET estado = v_nuevo::estado_factura_compra WHERE id = _factura_id;
    END IF;
  END IF;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.fema_facturas_compra LOOP
    PERFORM public.fema_reconciliar_factura(r.id, 'compra');
  END LOOP;
END $$;