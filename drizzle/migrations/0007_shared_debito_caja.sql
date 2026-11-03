CREATE OR REPLACE FUNCTION public.fema_impactar_caja(_mov_id uuid, _nuevo_estado text, _cuenta_id uuid DEFAULT NULL::uuid, _es_pago boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mov public.fema_movimientos_pago%ROWTYPE;
  v_obs text; v_marca text; v_nuevo_saldo numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.is_approved(v_uid) OR public.has_role(v_uid, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_mov FROM public.fema_movimientos_pago WHERE id = _mov_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento inexistente'; END IF;
  v_obs := regexp_replace(COALESCE(v_mov.observaciones, ''), '\s*\[(DEP|DEB):[^\]]+\]', '', 'g');
  IF _cuenta_id IS NOT NULL THEN
    v_marca := CASE WHEN _es_pago THEN 'DEB' ELSE 'DEP' END;
    v_obs := btrim(v_obs || ' [' || v_marca || ':' || _cuenta_id::text || ']');
  END IF;
  UPDATE public.fema_movimientos_pago SET estado = _nuevo_estado, observaciones = NULLIF(btrim(v_obs), '') WHERE id = _mov_id;
  IF _cuenta_id IS NOT NULL THEN
    UPDATE public.fema_cuentas_bancarias
       SET saldo = saldo + (CASE WHEN _es_pago THEN -1 ELSE 1 END) * v_mov.monto
     WHERE id = _cuenta_id RETURNING saldo INTO v_nuevo_saldo;
    IF v_nuevo_saldo IS NULL THEN RAISE EXCEPTION 'Cuenta bancaria inexistente'; END IF;
    DELETE FROM public.fema_caja_mov WHERE movimiento_pago_id = _mov_id;
    INSERT INTO public.fema_caja_mov (user_id, fecha, cuenta_id, tipo, monto, concepto, movimiento_pago_id, saldo_resultante)
    VALUES (v_uid, COALESCE(v_mov.vencimiento, v_mov.fecha_emision, CURRENT_DATE), _cuenta_id,
      CASE WHEN _es_pago THEN 'egreso' ELSE 'ingreso' END, v_mov.monto,
      COALESCE(NULLIF(v_mov.contraparte, ''), v_mov.instrumento) ||
        CASE WHEN v_mov.numero IS NOT NULL AND v_mov.numero <> '' THEN ' Nº ' || v_mov.numero ELSE '' END,
      _mov_id, v_nuevo_saldo);
  END IF;
  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');
  RETURN jsonb_build_object('ok', true, 'estado', _nuevo_estado, 'saldo', v_nuevo_saldo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fema_revertir_caja(_mov_id uuid, _estado text DEFAULT 'en_cartera'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mov public.fema_movimientos_pago%ROWTYPE;
  v_match text[]; v_signo int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT (public.is_approved(v_uid) OR public.has_role(v_uid, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_mov FROM public.fema_movimientos_pago WHERE id = _mov_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento inexistente'; END IF;
  v_match := regexp_match(COALESCE(v_mov.observaciones, ''), '\[(DEP|DEB):([^\]]+)\]');
  UPDATE public.fema_movimientos_pago
     SET estado = _estado,
         observaciones = NULLIF(btrim(regexp_replace(COALESCE(observaciones, ''), '\s*\[(DEP|DEB):[^\]]+\]', '', 'g')), '')
   WHERE id = _mov_id;
  IF v_match IS NOT NULL THEN
    v_signo := CASE WHEN v_match[1] = 'DEB' THEN 1 ELSE -1 END;
    UPDATE public.fema_cuentas_bancarias SET saldo = saldo + v_signo * v_mov.monto WHERE id = v_match[2]::uuid;
  END IF;
  DELETE FROM public.fema_caja_mov WHERE movimiento_pago_id = _mov_id;
  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');
  RETURN jsonb_build_object('ok', true);
END;
$function$;