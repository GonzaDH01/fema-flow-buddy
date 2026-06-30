
-- Compartir datos entre todos los usuarios aprobados de la organización.
-- Mantenemos el stamping de user_id en INSERT, pero permitimos lectura/edición a cualquier usuario aprobado.

CREATE OR REPLACE FUNCTION public.is_approved(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT aprobado FROM public.profiles WHERE id = _uid), false)
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fema_clientes','fema_combustible','fema_empleados','fema_equipos',
    'fema_estimaciones','fema_facturas_compra','fema_facturas_venta',
    'fema_horas_trabajadas','fema_impuestos','fema_medios_pago',
    'fema_presupuesto_items','fema_presupuestos','fema_proveedores',
    'fema_sueldos','fema_tanque_mov','fema_viajes_transp'
  ];
  polname text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- borrar políticas existentes _own
    FOR polname IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, t);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY "%1$s_shared_select" ON public.%1$I
        FOR SELECT TO authenticated
        USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_shared_insert" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_shared_update" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'))
        WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_shared_delete" ON public.%1$I
        FOR DELETE TO authenticated
        USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
    $f$, t);
  END LOOP;
END $$;

-- fema_movimientos_pago: mismo criterio
DROP POLICY IF EXISTS "users select own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users update own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users delete own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users insert own movs" ON public.fema_movimientos_pago;

CREATE POLICY "movs_shared_select" ON public.fema_movimientos_pago
  FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "movs_shared_insert" ON public.fema_movimientos_pago
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "movs_shared_update" ON public.fema_movimientos_pago
  FOR UPDATE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "movs_shared_delete" ON public.fema_movimientos_pago
  FOR DELETE TO authenticated
  USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
