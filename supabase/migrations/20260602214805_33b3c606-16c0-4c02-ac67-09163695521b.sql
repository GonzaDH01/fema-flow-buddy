
-- Tighten clientes policies (drop permissive ones)
drop policy if exists "authenticated update clientes" on public.clientes;
drop policy if exists "authenticated delete clientes" on public.clientes;

create policy "creator or admin can update clientes" on public.clientes
  for update to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

create policy "creator or admin can delete clientes" on public.clientes
  for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

-- Fix search_path on tg_set_updated_at
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Lock down execute on internal functions
revoke execute on function public.tg_set_updated_at() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
-- has_role still callable by authenticated for use inside policies; OK
