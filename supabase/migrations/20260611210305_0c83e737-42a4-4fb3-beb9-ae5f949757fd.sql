
-- RESTRICTIVE policy: bloquea cualquier INSERT donde el user_id coincide con
-- el usuario actual, salvo que el usuario actual ya sea admin. Esto cierra
-- la posibilidad de auto-asignarse rol admin incluso si en el futuro se
-- agrega una policy permisiva más laxa.
CREATE POLICY "no self role escalation"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() <> user_id OR public.has_role(auth.uid(), 'admin')
);

-- Lo mismo para UPDATE: nadie puede modificar su propia fila de rol
-- a menos que ya sea admin.
CREATE POLICY "no self role update"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  auth.uid() <> user_id OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  auth.uid() <> user_id OR public.has_role(auth.uid(), 'admin')
);
