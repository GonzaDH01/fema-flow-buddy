CREATE OR REPLACE VIEW public.fema_v_saldos_compra AS
SELECT
  f.id AS factura_id,
  f.user_id,
  f.total,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = ANY (ARRAY['pagado'::text, 'cedido'::text]) AND m.factura_compra_id IS NOT NULL), 0::numeric)
    + COALESCE(SUM(i.monto), 0::numeric) AS pagado,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'en_cartera'::text), 0::numeric) AS programado,
  GREATEST(
    f.total
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = ANY (ARRAY['pagado'::text, 'cedido'::text]) AND m.factura_compra_id IS NOT NULL), 0::numeric)
    - COALESCE(SUM(i.monto), 0::numeric)
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'en_cartera'::text), 0::numeric),
    0::numeric
  ) AS saldo,
  COUNT(m.id) FILTER (WHERE m.estado = 'en_cartera'::text) AS docs_programados,
  MIN(m.vencimiento) FILTER (WHERE m.estado = 'en_cartera'::text) AS proximo_vencimiento
FROM public.fema_facturas_compra f
LEFT JOIN public.fema_movimientos_pago m ON m.factura_compra_id = f.id
LEFT JOIN public.fema_imputaciones i ON i.factura_compra_id = f.id
GROUP BY f.id, f.user_id, f.total;

CREATE OR REPLACE VIEW public.fema_v_saldos_venta AS
SELECT
  f.id AS factura_id,
  f.user_id,
  f.total,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'cobrado'::text AND m.factura_venta_id IS NOT NULL), 0::numeric)
    + COALESCE(SUM(i.monto), 0::numeric) AS cobrado,
  COALESCE(SUM(m.monto) FILTER (WHERE m.estado = ANY (ARRAY['en_cartera'::text, 'pendiente'::text])), 0::numeric) AS programado,
  GREATEST(
    f.total
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = 'cobrado'::text AND m.factura_venta_id IS NOT NULL), 0::numeric)
    - COALESCE(SUM(i.monto), 0::numeric)
    - COALESCE(SUM(m.monto) FILTER (WHERE m.estado = ANY (ARRAY['en_cartera'::text, 'pendiente'::text])), 0::numeric),
    0::numeric
  ) AS saldo,
  COUNT(m.id) FILTER (WHERE m.estado = ANY (ARRAY['en_cartera'::text, 'pendiente'::text])) AS docs_programados,
  MIN(m.vencimiento) FILTER (WHERE m.estado = ANY (ARRAY['en_cartera'::text, 'pendiente'::text])) AS proximo_vencimiento
FROM public.fema_facturas_venta f
LEFT JOIN public.fema_movimientos_pago m ON m.factura_venta_id = f.id
LEFT JOIN public.fema_imputaciones i ON i.factura_venta_id = f.id
GROUP BY f.id, f.user_id, f.total;

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
    SELECT COALESCE(SUM(sub.monto), 0) INTO v_cubierto
    FROM (
      SELECT m.monto FROM public.fema_movimientos_pago m
       WHERE m.factura_compra_id = _factura_id AND m.estado IN ('pagado', 'cedido')
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

CREATE OR REPLACE FUNCTION public.fema_registrar_pago(
  _borrar uuid[] DEFAULT '{}'::uuid[],
  _ceder uuid[] DEFAULT '{}'::uuid[],
  _inserts jsonb DEFAULT '[]'::jsonb,
  _updates jsonb DEFAULT '[]'::jsonb
)
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
    INSERT INTO public.fema_movimientos_pago (
      user_id, instrumento, direccion, tipo_movimiento, fecha_emision, vencimiento,
      numero, banco, contraparte, monto, estado, observaciones,
      factura_venta_id, factura_compra_id, echeq_origen_id, anio, mes
    ) VALUES (
      v_uid,
      v_row->>'instrumento',
      v_row->>'direccion',
      v_row->>'tipo_movimiento',
      (v_row->>'fecha_emision')::date,
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
      COALESCE((v_row->>'anio')::int, EXTRACT(YEAR FROM now())::int),
      COALESCE((v_row->>'mes')::int, EXTRACT(MONTH FROM now())::int)
    )
    RETURNING id INTO v_id;

    v_count := v_count + 1;

    -- Imputaciones opcionales: permiten distribuir un movimiento en varias facturas.
    IF v_row ? 'imputaciones' THEN
      FOR v_imp IN SELECT * FROM jsonb_array_elements(v_row->'imputaciones')
      LOOP
        INSERT INTO public.fema_imputaciones (
          user_id, movimiento_pago_id, factura_venta_id, factura_compra_id, monto, fecha
        ) VALUES (
          v_uid, v_id,
          NULLIF(v_imp->>'factura_venta_id','')::uuid,
          NULLIF(v_imp->>'factura_compra_id','')::uuid,
          COALESCE((v_imp->>'monto')::numeric, 0),
          COALESCE(NULLIF(v_imp->>'fecha','')::date, (v_row->>'fecha_emision')::date)
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

    IF v_row ? 'imputaciones' THEN
      DELETE FROM public.fema_imputaciones WHERE movimiento_pago_id = v_id AND user_id = v_uid;
      FOR v_imp IN SELECT * FROM jsonb_array_elements(v_row->'imputaciones')
      LOOP
        INSERT INTO public.fema_imputaciones (
          user_id, movimiento_pago_id, factura_venta_id, factura_compra_id, monto, fecha
        ) VALUES (
          v_uid, v_id,
          NULLIF(v_imp->>'factura_venta_id','')::uuid,
          NULLIF(v_imp->>'factura_compra_id','')::uuid,
          COALESCE((v_imp->>'monto')::numeric, 0),
          COALESCE(NULLIF(v_imp->>'fecha','')::date, (v_row->>'fecha_emision')::date)
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
$function$;