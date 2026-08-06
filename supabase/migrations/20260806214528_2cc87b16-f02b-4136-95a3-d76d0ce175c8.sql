
-- Impacto de caja atómico al cambiar el estado de un movimiento de pago
CREATE OR REPLACE FUNCTION public.fema_impactar_caja(
  _mov_id uuid,
  _nuevo_estado text,
  _cuenta_id uuid DEFAULT NULL,
  _es_pago boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mov public.fema_movimientos_pago%ROWTYPE;
  v_obs text;
  v_marca text;
  v_nuevo_saldo numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_mov FROM public.fema_movimientos_pago
   WHERE id = _mov_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento inexistente'; END IF;

  v_obs := regexp_replace(COALESCE(v_mov.observaciones, ''), '\s*\[(DEP|DEB):[^\]]+\]', '', 'g');
  IF _cuenta_id IS NOT NULL THEN
    v_marca := CASE WHEN _es_pago THEN 'DEB' ELSE 'DEP' END;
    v_obs := btrim(v_obs || ' [' || v_marca || ':' || _cuenta_id::text || ']');
  END IF;

  UPDATE public.fema_movimientos_pago
     SET estado = _nuevo_estado,
         observaciones = NULLIF(btrim(v_obs), '')
   WHERE id = _mov_id AND user_id = v_uid;

  IF _cuenta_id IS NOT NULL THEN
    UPDATE public.fema_cuentas_bancarias
       SET saldo = saldo + (CASE WHEN _es_pago THEN -1 ELSE 1 END) * v_mov.monto
     WHERE id = _cuenta_id AND user_id = v_uid
     RETURNING saldo INTO v_nuevo_saldo;
    IF v_nuevo_saldo IS NULL THEN RAISE EXCEPTION 'Cuenta bancaria inexistente'; END IF;
  END IF;

  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');

  RETURN jsonb_build_object('ok', true, 'estado', _nuevo_estado, 'saldo', v_nuevo_saldo);
END;
$$;

-- Volver un movimiento a cartera / pendiente revirtiendo el impacto en caja
CREATE OR REPLACE FUNCTION public.fema_revertir_caja(_mov_id uuid, _estado text DEFAULT 'en_cartera')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mov public.fema_movimientos_pago%ROWTYPE;
  v_match text[];
  v_signo int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_mov FROM public.fema_movimientos_pago
   WHERE id = _mov_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento inexistente'; END IF;

  v_match := regexp_match(COALESCE(v_mov.observaciones, ''), '\[(DEP|DEB):([^\]]+)\]');

  UPDATE public.fema_movimientos_pago
     SET estado = _estado,
         observaciones = NULLIF(btrim(regexp_replace(COALESCE(observaciones, ''), '\s*\[(DEP|DEB):[^\]]+\]', '', 'g')), '')
   WHERE id = _mov_id AND user_id = v_uid;

  IF v_match IS NOT NULL THEN
    v_signo := CASE WHEN v_match[1] = 'DEB' THEN 1 ELSE -1 END;
    UPDATE public.fema_cuentas_bancarias
       SET saldo = saldo + v_signo * v_mov.monto
     WHERE id = v_match[2]::uuid AND user_id = v_uid;
  END IF;

  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Pase de dinero entre cuentas/fondos, atómico
CREATE OR REPLACE FUNCTION public.fema_mover_fondos(
  _origen_id uuid,
  _destino_id uuid,
  _monto numeric,
  _fecha date DEFAULT CURRENT_DATE,
  _observaciones text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saldo numeric;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RAISE EXCEPTION 'Importe inválido'; END IF;
  IF _origen_id = _destino_id THEN RAISE EXCEPTION 'Origen y destino deben ser distintos'; END IF;

  SELECT saldo INTO v_saldo FROM public.fema_cuentas_bancarias
   WHERE id = _origen_id AND user_id = v_uid FOR UPDATE;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'Cuenta de origen inexistente'; END IF;
  IF v_saldo < _monto THEN RAISE EXCEPTION 'El origen no tiene saldo suficiente'; END IF;

  PERFORM 1 FROM public.fema_cuentas_bancarias WHERE id = _destino_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de destino inexistente'; END IF;

  INSERT INTO public.fema_mov_fondos (user_id, fecha, origen_id, destino_id, monto, observaciones, anio, mes)
  VALUES (v_uid, _fecha, _origen_id, _destino_id, _monto, NULLIF(_observaciones, ''),
          EXTRACT(YEAR FROM _fecha)::int, EXTRACT(MONTH FROM _fecha)::int)
  RETURNING id INTO v_id;

  UPDATE public.fema_cuentas_bancarias SET saldo = saldo - _monto WHERE id = _origen_id AND user_id = v_uid;
  UPDATE public.fema_cuentas_bancarias SET saldo = saldo + _monto WHERE id = _destino_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Eliminar un pase revirtiendo ambos saldos
CREATE OR REPLACE FUNCTION public.fema_eliminar_mov_fondo(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mov public.fema_mov_fondos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT * INTO v_mov FROM public.fema_mov_fondos WHERE id = _id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pase inexistente'; END IF;

  DELETE FROM public.fema_mov_fondos WHERE id = _id AND user_id = v_uid;

  IF v_mov.origen_id IS NOT NULL THEN
    UPDATE public.fema_cuentas_bancarias SET saldo = saldo + v_mov.monto
     WHERE id = v_mov.origen_id AND user_id = v_uid;
  END IF;
  IF v_mov.destino_id IS NOT NULL THEN
    UPDATE public.fema_cuentas_bancarias SET saldo = saldo - v_mov.monto
     WHERE id = v_mov.destino_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fema_impactar_caja(uuid, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fema_revertir_caja(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fema_mover_fondos(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fema_eliminar_mov_fondo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fema_impactar_caja(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fema_revertir_caja(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fema_mover_fondos(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fema_eliminar_mov_fondo(uuid) TO authenticated;
