
CREATE TABLE public.fema_caja_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  cuenta_id uuid NOT NULL REFERENCES public.fema_cuentas_bancarias(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto numeric NOT NULL,
  concepto text,
  movimiento_pago_id uuid REFERENCES public.fema_movimientos_pago(id) ON DELETE SET NULL,
  mov_fondo_id uuid REFERENCES public.fema_mov_fondos(id) ON DELETE SET NULL,
  saldo_resultante numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_caja_mov TO authenticated;
GRANT ALL ON public.fema_caja_mov TO service_role;

ALTER TABLE public.fema_caja_mov ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caja_mov_select" ON public.fema_caja_mov FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "caja_mov_insert" ON public.fema_caja_mov FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "caja_mov_update" ON public.fema_caja_mov FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "caja_mov_delete" ON public.fema_caja_mov FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_caja_mov_cuenta_fecha ON public.fema_caja_mov (cuenta_id, fecha DESC);
CREATE INDEX idx_caja_mov_pago ON public.fema_caja_mov (movimiento_pago_id);

CREATE TRIGGER fema_caja_mov_updated_at BEFORE UPDATE ON public.fema_caja_mov
FOR EACH ROW EXECUTE FUNCTION public.fema_set_updated_at();

-- Registrar asiento en el libro de caja al impactar un movimiento de pago
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

    DELETE FROM public.fema_caja_mov WHERE movimiento_pago_id = _mov_id AND user_id = v_uid;
    INSERT INTO public.fema_caja_mov (user_id, fecha, cuenta_id, tipo, monto, concepto, movimiento_pago_id, saldo_resultante)
    VALUES (
      v_uid, COALESCE(v_mov.vencimiento, v_mov.fecha_emision, CURRENT_DATE), _cuenta_id,
      CASE WHEN _es_pago THEN 'egreso' ELSE 'ingreso' END, v_mov.monto,
      COALESCE(NULLIF(v_mov.contraparte, ''), v_mov.instrumento) ||
        CASE WHEN v_mov.numero IS NOT NULL AND v_mov.numero <> '' THEN ' Nº ' || v_mov.numero ELSE '' END,
      _mov_id, v_nuevo_saldo
    );
  END IF;

  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');

  RETURN jsonb_build_object('ok', true, 'estado', _nuevo_estado, 'saldo', v_nuevo_saldo);
END;
$$;

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

  DELETE FROM public.fema_caja_mov WHERE movimiento_pago_id = _mov_id AND user_id = v_uid;

  PERFORM public.fema_reconciliar_factura(v_mov.factura_venta_id, 'venta');
  PERFORM public.fema_reconciliar_factura(v_mov.factura_compra_id, 'compra');

  RETURN jsonb_build_object('ok', true);
END;
$$;

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
  v_s_org numeric;
  v_s_dst numeric;
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

  UPDATE public.fema_cuentas_bancarias SET saldo = saldo - _monto
   WHERE id = _origen_id AND user_id = v_uid RETURNING saldo INTO v_s_org;
  UPDATE public.fema_cuentas_bancarias SET saldo = saldo + _monto
   WHERE id = _destino_id AND user_id = v_uid RETURNING saldo INTO v_s_dst;

  INSERT INTO public.fema_caja_mov (user_id, fecha, cuenta_id, tipo, monto, concepto, mov_fondo_id, saldo_resultante)
  VALUES (v_uid, _fecha, _origen_id, 'egreso', _monto, COALESCE(NULLIF(_observaciones,''),'Pase entre cuentas'), v_id, v_s_org),
         (v_uid, _fecha, _destino_id, 'ingreso', _monto, COALESCE(NULLIF(_observaciones,''),'Pase entre cuentas'), v_id, v_s_dst);

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fema_impactar_caja(uuid, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fema_revertir_caja(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fema_mover_fondos(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fema_impactar_caja(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fema_revertir_caja(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fema_mover_fondos(uuid, uuid, numeric, date, text) TO authenticated;
