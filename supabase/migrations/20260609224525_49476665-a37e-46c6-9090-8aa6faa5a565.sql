
-- 1. Add fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aprobado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modulos_permitidos text[] NOT NULL DEFAULT '{}';

-- 2. Approve existing admin and grant all modules
UPDATE public.profiles
SET aprobado = true,
    modulos_permitidos = ARRAY['dashboard','cashflow','facturas','estimaciones','clientes','compras','combustible','proveedores','empleados','impuestos','presupuestos','medios','ocr','auditoria','usuarios']
WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- 3. RLS: admins can read/update all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. RLS: admins can manage user_roles
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
