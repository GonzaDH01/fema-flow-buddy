ALTER TABLE public.fema_empleados
  ADD COLUMN IF NOT EXISTS dni_frente_path text,
  ADD COLUMN IF NOT EXISTS dni_dorso_path text,
  ADD COLUMN IF NOT EXISTS foto_path text,
  ADD COLUMN IF NOT EXISTS forma_pago text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS cbu text,
  ADD COLUMN IF NOT EXISTS alias_cbu text,
  ADD COLUMN IF NOT EXISTS titular_cuenta text,
  ADD COLUMN IF NOT EXISTS frecuencia_pago text,
  ADD COLUMN IF NOT EXISTS tareas text,
  ADD COLUMN IF NOT EXISTS maquinaria text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;