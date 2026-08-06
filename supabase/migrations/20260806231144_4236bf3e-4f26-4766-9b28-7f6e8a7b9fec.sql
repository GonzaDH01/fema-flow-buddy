
DROP POLICY IF EXISTS "approved delete gastos fijos" ON public.fema_gastos_fijos;
DROP POLICY IF EXISTS "approved update gastos fijos" ON public.fema_gastos_fijos;
CREATE POLICY "owner or admin delete gastos fijos" ON public.fema_gastos_fijos
  FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));
CREATE POLICY "owner or admin update gastos fijos" ON public.fema_gastos_fijos
  FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "approved delete gf mov" ON public.fema_gastos_fijos_mov;
DROP POLICY IF EXISTS "approved update gf mov" ON public.fema_gastos_fijos_mov;
CREATE POLICY "owner or admin delete gf mov" ON public.fema_gastos_fijos_mov
  FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));
CREATE POLICY "owner or admin update gf mov" ON public.fema_gastos_fijos_mov
  FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')))
  WITH CHECK (is_approved(auth.uid()) AND (auth.uid() = user_id OR has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "periodos_select" ON public.fema_periodos_cierre;
CREATE POLICY "periodos_select_approved" ON public.fema_periodos_cierre
  FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));
