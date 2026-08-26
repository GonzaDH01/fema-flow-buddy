create table if not exists public.fema_productos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  unidad_medida text not null,
  precio numeric,
  categoria text not null,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fema_productos TO authenticated;
GRANT ALL ON public.fema_productos TO service_role;

alter table public.fema_productos enable row level security;

create policy "Usuarios aprobados ven los productos"
  on public.fema_productos for select to authenticated using (true);

create policy "Usuarios aprobados insertan productos"
  on public.fema_productos for insert to authenticated with check (auth.uid() = user_id);

create policy "Usuarios aprobados editan productos"
  on public.fema_productos for update to authenticated using (true) with check (true);

create policy "Usuarios aprobados eliminan productos"
  on public.fema_productos for delete to authenticated using (true);

create trigger update_fema_productos_updated_at before update on public.fema_productos
  for each row execute function public.set_updated_at();

insert into public.fema_productos (user_id, nombre, unidad_medida, categoria)
select u.id, p.nombre, p.unidad, p.categoria
from (select id from auth.users order by created_at limit 1) u
cross join (values
  ('Gasoil', 'Litro', 'Combustible'),
  ('Silo bolsa', 'Metro', 'Insumos'),
  ('Hectáreas picado maíz', 'Hectarea', 'Servicios'),
  ('Metros embolsados de maíz', 'Metro', 'Servicios'),
  ('Dólar oficial', 'Dolar', 'Cotizaciones'),
  ('Dólar Blue', 'Dolar', 'Cotizaciones'),
  ('Hectáreas de alfalfa', 'Hectarea', 'Servicios'),
  ('Metros embolsados de alfalfa', 'Metro', 'Servicios'),
  ('Traslado maquinaria', 'Viaje', 'Traslados'),
  ('Traslado chasis', 'Viaje', 'Traslados'),
  ('Traslado batea', 'Viaje', 'Traslados')
) as p(nombre, unidad, categoria)
where not exists (select 1 from public.fema_productos);