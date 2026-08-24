DROP POLICY IF EXISTS "approved update cuotas" ON public.fema_creditos_cuotas;
CREATE POLICY "approved update cuotas" ON public.fema_creditos_cuotas
FOR UPDATE TO authenticated
USING (public.is_approved(auth.uid()))
WITH CHECK (public.is_approved(auth.uid()) AND public.is_approved(user_id));