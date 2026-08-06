CREATE OR REPLACE FUNCTION public.fema_registrar_pago(_borrar uuid[] DEFAULT '{}'::uuid[], _ceder uuid[] DEFAULT '{}'::uuid[], _inserts jsonb DEFAULT '[]'::jsonb, _updates jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_id uuid;
  v_imp jsonb;
  v_afectadas_v uuid[] := '{}';
  v_afectadas_c uuid[] := '{}';
  v_fid uuid;
  v_count int := 0;
  v_fecha_emision date;
  v_anio int;
  v_mes int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT factura_venta_id) FILTER (WHERE factura_venta_id IS NOT NULL), '{}'),
         COALESCE(array_agg(DISTINCT factura_compra_id) FILTER (WHERE factura_compra_id IS NOT NULL), '{}')
    INTO v_afectadas_v, v_afectadas_c
    FROM public.fema_movimientos_pago
   WHERE id = ANY(COALESCE(_borrar, '{}')) AND user_id = v_uid;

  IF array_length(_borrar, 1) > 0 THEN
    DELETE FROM public.fema_movimientos_pago WHERE id = ANY(_borrar) AND user_id = v_uid;
  END IF;

  IF array_length(_ceder, 1) > 0 THEN
    UPDATE public.fema_movimientos_pago
       SET estado = 'cedido'
     WHERE id = ANY(_ceder) AND user_id = v_uid;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(_inserts, '[]'::jsonb))
  LOOP
    v_fecha_emision := COALESCE(NULLIF(v_row->>'fecha_emision','')::date, CURRENT_DATE);
    v_anio := COALESCE((v_row->>'anio')::int, EXTRACT(YEAR FROM v_fecha_emision)::int);
    v_mes := COALESCE((v_row->>'mes')::int, EXTRACT(MONTH FROM v_fecha_emision)::int);

    INSERT INTO public.fema_movimientos_pago (
      user_id, instrumento, direccion, tipo_movimiento, fecha_emision, vencimiento,
      numero, banco, contraparte, monto, estado, observaciones,
      factura_venta_id, factura_compra_id, echeq_origen_id, anio, mes
    ) VALUES (
      v_uid,
      v_row->>'instrumento',
      v_row->>'direccion',
      v_row->>'tipo_movimiento',
      v_fecha_emision,
      NULLIF(v_row->>'vencimiento','')::date,
      NULLIF(v_row->>'numero',''),
      NULLIF(v_row->>'banco',''),
      NULLIF(v_row->>'contraparte',''),
      COALESCE((v_row->>'monto')::numeric, 0),
      v_row->>'estado',
      NULLIF(v_row->>'observaciones',''),
      NULLIF(v_row->>'factura_venta_id','')::uuid,
      NULLIF(v_row->>'factura_compra_id','')::uuid,
      NULLIF(v_row->>'echeq_origen_id','')::uuid,
      v_anio,
      v_mes
    )
    RETURNING id INTO v_id;

    v_count := v_count + 1;

    IF v_row ? 'imputaciones' THEN
      FOR v_imp IN SELECT * FROM jsonb_array_elements(v_row->'imputaciones')
      LOOP
        INSERT INTO public.fema_imputaciones (
          user_id, movimiento_pago_id, factura_venta_id, factura_compra_id, monto, fecha, anio, mes
        ) VALUES (
          v_uid, v_id,
          NULLIF(v_imp->>'factura_venta_id','')::uuid,
          NULLIF(v_imp->>'factura_compra_id','')::uuid,
          COALESCE((v_imp->>'monto')::numeric, 0),
          COALESCE(NULLIF(v_imp->>'fecha','')::date, v_fecha_emision),
          v_anio,
          v_mes
        );
        IF NULLIF(v_imp->>'factura_venta_id','') IS NOT NULL THEN
          v_afectadas_v := array_append(v_afectadas_v, (v_imp->>'factura_venta_id')::uuid);
        END IF;
        IF NULLIF(v_imp->>'factura_compra_id','') IS NOT NULL THEN
          v_afectadas_c := array_append(v_afectadas_c, (v_imp->>'factura_compra_id')::uuid);
        END IF;
      END LOOP;
    ELSE
      IF NULLIF(v_row->>'factura_venta_id','') IS NOT NULL THEN
        v_afectadas_v := array_append(v_afectadas_v, (v_row->>'factura_venta_id')::uuid);
      END IF;
      IF NULLIF(v_row->>'factura_compra_id','') IS NOT NULL THEN
        v_afectadas_c := array_append(v_afectadas_c, (v_row->>'factura_compra_id')::uuid);
      END IF;
    END IF;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(_updates, '[]'::jsonb))
  LOOP
    v_id := (v_row->>'id')::uuid;
    SELECT factura_venta_id, factura_compra_id INTO v_fid, v_fid
      FROM public.fema_movimientos_pago WHERE id = v_id AND user_id = v_uid;

    UPDATE public.fema_movimientos_pago SET
      instrumento = COALESCE(v_row->>'instrumento', instrumento),
      direccion = COALESCE(v_row->>'direccion', direccion),
      tipo_movimiento = COALESCE(v_row->>'tipo_movimiento', tipo_movimiento),
      fecha_emision = COALESCE(NULLIF(v_row->>'fecha_emision','')::date, fecha_emision),
      vencimiento = NULLIF(v_row->>'vencimiento','')::date,
      numero = NULLIF(v_row->>'numero',''),
      banco = NULLIF(v_row->>'banco',''),
      contraparte = NULLIF(v_row->>'contraparte',''),
      monto = COALESCE((v_row->>'monto')::numeric, monto),
      estado = COALESCE(v_row->>'estado', estado),
      observaciones = NULLIF(v_row->>'observaciones',''),
      factura_venta_id = NULLIF(v_row->>'factura_venta_id','')::uuid,
      factura_compra_id = NULLIF(v_row->>'factura_compra_id','')::uuid,
      anio = COALESCE((v_row->>'anio')::int, anio),
      mes = COALESCE((v_row->>'mes')::int, mes)
    WHERE id = v_id AND user_id = v_uid;

    v_count := v_count + 1;
    IF NULLIF(v_row->>'factura_venta_id','') IS NOT NULL THEN
      v_afectadas_v := array_append(v_afectadas_v, (v_row->>'factura_venta_id')::uuid);
    END IF;
    IF NULLIF(v_row->>'factura_compra_id','') IS NOT NULL THEN
      v_afectadas_c := array_append(v_afectadas_c, (v_row->>'factura_compra_id')::uuid);
    END IF;
  END LOOP;

  FOREACH v_fid IN ARRAY COALESCE(v_afectadas_v, '{}')
  LOOP
    PERFORM public.fema_reconciliar_factura(v_fid, 'venta');
  END LOOP;
  FOREACH v_fid IN ARRAY COALESCE(v_afectadas_c, '{}')
  LOOP
    PERFORM public.fema_reconciliar_factura(v_fid, 'compra');
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'movimientos', v_count);
END;
$function$