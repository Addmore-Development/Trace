-- =====================================================================
-- Addmore / Trace : Supabase schema
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------------------------------------------------

create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sector      text not null default 'Businesses',
  plan        text not null default 'Starter',
  status      text not null default 'Active' check (status in ('Active','Suspended')),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organisations(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'Staff' check (role in ('Owner','Manager','Staff','Viewer')),
  bio         text not null default '',
  photo_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_org_idx on public.profiles(org_id);

create table if not exists public.categories (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9]{2,3}$'),
  name        text not null,
  fields      jsonb not null default '[]'::jsonb,
  manager_id  uuid references public.profiles(id) on delete set null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (org_id, code)
);

create table if not exists public.assets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  tag            text not null check (tag ~ '^[A-Za-z0-9-]{2,30}$'),
  category_code  text not null,
  name           text not null,
  location       text not null default '',
  status         text not null default 'Active' check (status in ('Active','Assigned','In repair','Lost')),
  assigned_to    text,
  value          numeric(14,2) not null default 0,
  extra          jsonb not null default '{}'::jsonb,
  approval       text check (approval in ('Approved','Declined')),
  alert          jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, tag),
  foreign key (org_id, category_code) references public.categories(org_id, code) on update cascade
);
create index if not exists assets_org_idx on public.assets(org_id);

create table if not exists public.usage_log (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organisations(id) on delete cascade,
  asset_tag     text not null,
  asset_name    text not null default '',
  category_code text not null default '',
  used_by       text,
  location      text,
  purpose       text,
  event         text not null,
  created_by    uuid references auth.users(id) on delete set null,
  at            timestamptz not null default now()
);
create index if not exists usage_log_org_at_idx on public.usage_log(org_id, at desc);

create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations(id) on delete cascade,
  email        text not null,
  role         text not null default 'Staff' check (role in ('Manager','Staff','Viewer')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create unique index if not exists invites_open_email_idx
  on public.invites (lower(email)) where accepted_at is null;

-- Addmore staff who can see every business in the Admin console
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Helper functions -------------------------------------------

create or replace function public.auth_org() returns uuid
language sql stable security definer set search_path = public as
$$ select org_id from public.profiles where id = auth.uid() $$;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before update on public.assets
  for each row execute function public.touch_updated_at();

-- Default categories for a brand-new organisation
create or replace function public.seed_categories(p_org uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  insert into public.categories (org_id, code, name, fields, sort_order) values
    (p_org,'LT','Laptop',    '["Serial number","RAM"]',        1),
    (p_org,'MN','Monitor',   '["Screen size","Serial number"]',2),
    (p_org,'TL','Tool',      '["Brand","Last service"]',       3),
    (p_org,'PH','Phone',     '["IMEI","Network"]',             4),
    (p_org,'FN','Furniture', '["Material"]',                   5),
    (p_org,'VH','Vehicle',   '["Registration","Odometer"]',    6)
  on conflict do nothing;
end $$;

-- New sign-up: join the organisation you were invited to, or create your own (as Owner)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  inv  public.invites%rowtype;
  org  uuid;
  nm   text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1));
begin
  select * into inv from public.invites
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;

  if found then
    insert into public.profiles (id, org_id, full_name, email, role)
    values (new.id, inv.org_id, nm, new.email, inv.role);
    update public.invites set accepted_at = now() where id = inv.id;
  else
    insert into public.organisations (name, sector)
    values (coalesce(nullif(new.raw_user_meta_data->>'org_name',''), 'My organisation'),
            coalesce(nullif(new.raw_user_meta_data->>'sector',''), 'Businesses'))
    returning id into org;
    perform public.seed_categories(org);
    insert into public.profiles (id, org_id, full_name, email, role)
    values (new.id, org, nm, new.email, 'Owner');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an Owner may change someone's role or organisation
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if (new.role is distinct from old.role or new.org_id is distinct from old.org_id) then
    if auth.uid() is null then return new; end if;   -- SQL editor / service role
    if public.auth_role() is distinct from 'Owner' or old.org_id is distinct from public.auth_org() then
      raise exception 'Only an Owner can change roles';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'Organisation cannot be changed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Admin console overview: every business for Addmore staff, otherwise just your own
create or replace function public.admin_overview()
returns table (id uuid, name text, sector text, plan text, assets bigint, status text)
language sql stable security definer set search_path = public as
$$
  select o.id, o.name, o.sector, o.plan,
         (select count(*) from public.assets a where a.org_id = o.id) as assets,
         o.status
    from public.organisations o
   where public.is_platform_admin() or o.id = public.auth_org()
   order by o.created_at
$$;

-- ---------- Row Level Security -------------------------------------------

alter table public.organisations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.assets          enable row level security;
alter table public.usage_log       enable row level security;
alter table public.invites         enable row level security;
alter table public.platform_admins enable row level security;

-- organisations
drop policy if exists org_select on public.organisations;
create policy org_select on public.organisations for select to authenticated
  using (id = public.auth_org() or public.is_platform_admin());
drop policy if exists org_update on public.organisations;
create policy org_update on public.organisations for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = public.auth_org());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (org_id = public.auth_org() and (id = auth.uid() or public.auth_role() = 'Owner'))
  with check (org_id = public.auth_org());

-- categories (everyone reads; Owner/Manager write)
drop policy if exists cat_select on public.categories;
create policy cat_select on public.categories for select to authenticated
  using (org_id = public.auth_org());
drop policy if exists cat_write on public.categories;
create policy cat_write on public.categories for all to authenticated
  using (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager'))
  with check (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager'));

-- assets
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated
  using (org_id = public.auth_org());
drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
  with check (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager'));
drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated
  using (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager','Staff'))
  with check (org_id = public.auth_org());
drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated
  using (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager'));

-- usage log
drop policy if exists log_select on public.usage_log;
create policy log_select on public.usage_log for select to authenticated
  using (org_id = public.auth_org());
drop policy if exists log_insert on public.usage_log;
create policy log_insert on public.usage_log for insert to authenticated
  with check (org_id = public.auth_org() and public.auth_role() in ('Owner','Manager','Staff'));

-- invites (Owner only)
drop policy if exists inv_all on public.invites;
create policy inv_all on public.invites for all to authenticated
  using (org_id = public.auth_org() and public.auth_role() = 'Owner')
  with check (org_id = public.auth_org() and public.auth_role() = 'Owner');

-- platform admins can see their own row (so the app can tell)
drop policy if exists pa_select on public.platform_admins;
create policy pa_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- ---------- Grants ---------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.admin_overview() to authenticated;

-- ---------- Back-fill: accounts that existed before this schema ---------------
do $$
declare u record; org uuid;
begin
  for u in select * from auth.users where id not in (select id from public.profiles) loop
    insert into public.organisations (name) values ('My organisation') returning id into org;
    perform public.seed_categories(org);
    insert into public.profiles (id, org_id, full_name, email, role)
    values (u.id, org, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1)), u.email, 'Owner');
  end loop;
end $$;

-- ---------- Optional: make yourself an Addmore platform admin ---------------
-- insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@addmore.co.za';