-- Gestión de user_roles por admins
CREATE POLICY "admins insert user_roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update user_roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete user_roles" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins view all user_roles" ON public.user_roles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins ven todos los perfiles
CREATE POLICY "admins view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Lectura global para contadores
CREATE POLICY "contador read facturas" ON public.facturas
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read clientes_proveedores" ON public.clientes_proveedores
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read productos" ON public.productos
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read iva" ON public.iva
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read percepciones" ON public.percepciones
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read retenciones" ON public.retenciones
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));

CREATE POLICY "contador read factura_items" ON public.factura_items
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'contador'));