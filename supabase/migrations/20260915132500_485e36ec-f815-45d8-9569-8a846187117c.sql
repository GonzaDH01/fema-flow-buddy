ALTER TABLE public.fema_activo_imagenes
  ADD COLUMN IF NOT EXISTS es_documento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nombre_archivo text;