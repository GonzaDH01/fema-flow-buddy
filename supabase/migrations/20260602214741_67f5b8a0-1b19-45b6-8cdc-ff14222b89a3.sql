
-- Roles enum + table
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  telefono text,
  empresa text,
  direccion text,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Grants
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

grant select, insert, update, delete on public.clientes to authenticated;
grant all on public.clientes to service_role;

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clientes enable row level security;

-- Security-definer role check
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Profiles policies
create policy "users view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- user_roles policies
create policy "users view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- Clientes policies (shared workspace)
create policy "authenticated view clientes" on public.clientes
  for select to authenticated using (true);
create policy "authenticated insert clientes" on public.clientes
  for insert to authenticated with check (auth.uid() = created_by);
create policy "authenticated update clientes" on public.clientes
  for update to authenticated using (true);
create policy "authenticated delete clientes" on public.clientes
  for delete to authenticated using (true);

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger set_updated_at_profiles before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at_clientes before update on public.clientes
  for each row execute function public.tg_set_updated_at();

-- Auto-create profile + default role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
