
-- 1) Endurecer RLS de fema_movimientos_pago: limitar a usuarios autenticados
DROP POLICY IF EXISTS "users delete own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users insert own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users select own movs" ON public.fema_movimientos_pago;
DROP POLICY IF EXISTS "users update own movs" ON public.fema_movimientos_pago;

CREATE POLICY "users select own movs" ON public.fema_movimientos_pago
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own movs" ON public.fema_movimientos_pago
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own movs" ON public.fema_movimientos_pago
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own movs" ON public.fema_movimientos_pago
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Admins pueden ver/gestionar movimientos de todos los usuarios
CREATE POLICY "admins manage all movs" ON public.fema_movimientos_pago
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Limpiar policy duplicada en profiles
DROP POLICY IF EXISTS "admins view all profiles" ON public.profiles;
