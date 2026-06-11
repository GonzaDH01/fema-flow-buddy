
-- RESTRICTIVE: solo admins pueden modificar user_roles (cualquier fila)
CREATE POLICY "admin only insert roles" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin only update roles" ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin only delete roles" ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RESTRICTIVE en profiles: si un usuario no-admin intenta cambiar
-- aprobado o modulos_permitidos (en su propia fila o ajena), se bloquea.
CREATE POLICY "only admin changes approval and modules" ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR auth.uid() = id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      auth.uid() = id
      AND aprobado IS NOT DISTINCT FROM (SELECT p.aprobado FROM public.profiles p WHERE p.id = profiles.id)
      AND modulos_permitidos IS NOT DISTINCT FROM (SELECT p.modulos_permitidos FROM public.profiles p WHERE p.id = profiles.id)
    )
  );
