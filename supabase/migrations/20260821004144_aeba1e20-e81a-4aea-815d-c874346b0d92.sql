DROP POLICY IF EXISTS caja_mov_select ON public.fema_caja_mov;
CREATE POLICY caja_mov_select ON public.fema_caja_mov FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS caja_mov_update ON public.fema_caja_mov;
CREATE POLICY caja_mov_update ON public.fema_caja_mov FOR UPDATE TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS caja_mov_delete ON public.fema_caja_mov;
CREATE POLICY caja_mov_delete ON public.fema_caja_mov FOR DELETE TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Usuarios gestionan sus propias imputaciones" ON public.fema_imputaciones;
CREATE POLICY imputaciones_shared_select ON public.fema_imputaciones FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY imputaciones_shared_insert ON public.fema_imputaciones FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY imputaciones_shared_update ON public.fema_imputaciones FOR UPDATE TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY imputaciones_shared_delete ON public.fema_imputaciones FOR DELETE TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_caja_mov TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_imputaciones TO authenticated;

UPDATE public.profiles
SET modulos_permitidos = (SELECT array_agg(DISTINCT m) FROM unnest(modulos_permitidos || ARRAY['exportaciones']) m)
WHERE aprobado = true;