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

-- =====================================================================
-- ADMIN CONSOLE UPGRADE
--   * Platform-admin-only tools: moderate businesses, update asset
--     statuses, platform reporting
--   * Login tracking (who signed in, and how many times)
-- Everything below is safe to re-run.
-- All admin_* functions refuse to run for anyone who is not in
-- public.platform_admins, so hiding the page in the UI is not the only
-- line of defence.
-- =====================================================================

-- The old overview also returned a normal user's own business. Replaced by admin_orgs().
drop function if exists public.admin_overview();

-- ---------- Tables ----------------------------------------------------

-- One row per sign-in
create table if not exists public.login_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  org_id        uuid references public.organisations(id) on delete set null,
  email         text not null default '',
  logged_in_at  timestamptz not null default now()
);
create index if not exists login_events_user_idx on public.login_events(user_id, logged_in_at desc);
create index if not exists login_events_at_idx   on public.login_events(logged_in_at desc);

-- Admin-only notes and suspension reason for a business.
-- Kept out of public.organisations on purpose: users can read their own organisation row.
create table if not exists public.org_moderation (
  org_id            uuid primary key references public.organisations(id) on delete cascade,
  notes             text not null default '',
  suspended_reason  text,
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now()
);

-- Everything an admin changes is written here
create table if not exists public.admin_audit (
  id        bigint generated always as identity primary key,
  admin_id  uuid references auth.users(id) on delete set null,
  org_id    uuid references public.organisations(id) on delete set null,
  action    text not null,
  detail    text not null default '',
  at        timestamptz not null default now()
);
create index if not exists admin_audit_at_idx on public.admin_audit(at desc);

-- ---------- Row Level Security: platform admins only -------------------

alter table public.login_events   enable row level security;
alter table public.org_moderation enable row level security;
alter table public.admin_audit    enable row level security;

drop policy if exists le_admin_select on public.login_events;
create policy le_admin_select on public.login_events for select to authenticated
  using (public.is_platform_admin());

drop policy if exists om_admin_select on public.org_moderation;
create policy om_admin_select on public.org_moderation for select to authenticated
  using (public.is_platform_admin());

drop policy if exists aa_admin_select on public.admin_audit;
create policy aa_admin_select on public.admin_audit for select to authenticated
  using (public.is_platform_admin());

-- Reads only. All writes go through the functions below.
revoke all on public.login_events, public.org_moderation, public.admin_audit from anon, authenticated;
grant select on public.login_events, public.org_moderation, public.admin_audit to authenticated;

-- ---------- Login tracking ---------------------------------------------

-- Called by the app right after a successful sign-in. Ignores a repeat within a minute.
create or replace function public.record_login() returns void
language plpgsql security definer set search_path = public as
$$
declare me public.profiles%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then return; end if;
  if exists (select 1 from public.login_events
              where user_id = me.id and logged_in_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.login_events (user_id, org_id, email) values (me.id, me.org_id, me.email);
end $$;

-- ---------- Admin: businesses --------------------------------------------

create or replace function public.admin_orgs()
returns table (id uuid, name text, sector text, plan text, status text, created_at timestamptz,
               users bigint, assets bigint, asset_value numeric, last_login_at timestamptz,
               notes text, suspended_reason text)
language plpgsql stable security definer set search_path = public as
$$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select o.id, o.name, o.sector, o.plan, o.status, o.created_at,
         (select count(*) from public.profiles p where p.org_id = o.id),
         (select count(*) from public.assets a where a.org_id = o.id),
         (select coalesce(sum(a.value), 0) from public.assets a where a.org_id = o.id),
         (select max(l.logged_in_at) from public.login_events l where l.org_id = o.id),
         coalesce(m.notes, ''),
         m.suspended_reason
    from public.organisations o
    left join public.org_moderation m on m.org_id = o.id
   order by o.created_at;
end $$;

create or replace function public.admin_set_org_status(p_org uuid, p_status text, p_reason text default '')
returns void
language plpgsql security definer set search_path = public as
$$
declare nm text;
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  if p_status not in ('Active','Suspended') then raise exception 'Invalid status: %', p_status; end if;
  update public.organisations set status = p_status where id = p_org returning name into nm;
  if not found then raise exception 'Business not found'; end if;

  insert into public.org_moderation (org_id, suspended_reason, updated_by)
  values (p_org, case when p_status = 'Suspended' then nullif(trim(p_reason), '') end, auth.uid())
  on conflict (org_id) do update
    set suspended_reason = excluded.suspended_reason,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.admin_audit (admin_id, org_id, action, detail)
  values (auth.uid(), p_org,
          case when p_status = 'Suspended' then 'Suspended business' else 'Reactivated business' end,
          coalesce(nullif(trim(p_reason), ''), ''));
end $$;

create or replace function public.admin_set_org_notes(p_org uuid, p_notes text)
returns void
language plpgsql security definer set search_path = public as
$$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  if not exists (select 1 from public.organisations where id = p_org) then raise exception 'Business not found'; end if;
  insert into public.org_moderation (org_id, notes, updated_by)
  values (p_org, coalesce(p_notes, ''), auth.uid())
  on conflict (org_id) do update
    set notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  insert into public.admin_audit (admin_id, org_id, action, detail)
  values (auth.uid(), p_org, 'Edited moderation notes', '');
end $$;

-- ---------- Admin: stored items (assets) -----------------------------------

create or replace function public.admin_assets()
returns table (id uuid, org_id uuid, org_name text, tag text, category_code text, name text,
               location text, status text, assigned_to text, value numeric, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as
$$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select a.id, a.org_id, o.name, a.tag, a.category_code, a.name,
         a.location, a.status, a.assigned_to, a.value, a.updated_at
    from public.assets a
    join public.organisations o on o.id = a.org_id
   order by a.updated_at desc
   limit 5000;
end $$;

create or replace function public.admin_set_asset_status(p_asset uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as
$$
declare a public.assets%rowtype; ev text;
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  if p_status not in ('Active','Assigned','In repair','Lost') then raise exception 'Invalid status: %', p_status; end if;
  select * into a from public.assets where id = p_asset for update;
  if not found then raise exception 'Asset not found'; end if;
  if a.status = p_status then return; end if;
  if p_status = 'Assigned' and coalesce(a.assigned_to, '') = '' then
    raise exception 'Nobody is assigned to this asset, so it cannot be marked Assigned';
  end if;

  update public.assets
     set status      = p_status,
         assigned_to = case when p_status = 'Assigned' then assigned_to else null end,
         approval    = case when p_status = 'Assigned' then approval else null end,
         alert       = case when p_status = 'Active' then null else alert end
   where id = p_asset;

  -- Same event names the app already uses, so the business sees it in its usage log
  ev := case p_status when 'Active' then 'Returned' when 'In repair' then 'Sent to repair'
                      when 'Lost' then 'Reported missing' else 'Assigned' end;
  insert into public.usage_log (org_id, asset_tag, asset_name, category_code, used_by, location, purpose, event, created_by)
  values (a.org_id, a.tag, a.name, a.category_code, a.assigned_to, a.location,
          'Status changed by Addmore admin (was ' || a.status || ')', ev, auth.uid());

  insert into public.admin_audit (admin_id, org_id, action, detail)
  values (auth.uid(), a.org_id, 'Changed asset status', a.tag || ': ' || a.status || ' -> ' || p_status);
end $$;

-- ---------- Admin: logins ---------------------------------------------------

-- Every user, with how many times they have signed in (0 if never)
create or replace function public.admin_login_summary()
returns table (user_id uuid, full_name text, email text, role text, org_id uuid, org_name text,
               login_count bigint, first_login_at timestamptz, last_login_at timestamptz, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as
$$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select p.id, p.full_name, p.email, p.role, p.org_id, o.name,
         count(l.id), min(l.logged_in_at), max(l.logged_in_at), p.created_at
    from public.profiles p
    join public.organisations o on o.id = p.org_id
    left join public.login_events l on l.user_id = p.id
   group by p.id, o.id
   order by max(l.logged_in_at) desc nulls last, p.created_at;
end $$;

create or replace function public.admin_recent_logins(p_limit int default 30)
returns table (user_id uuid, full_name text, email text, org_name text, logged_in_at timestamptz)
language plpgsql stable security definer set search_path = public as
$$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return query
  select l.user_id, p.full_name, l.email, o.name, l.logged_in_at
    from public.login_events l
    left join public.profiles p on p.id = l.user_id
    left join public.organisations o on o.id = l.org_id
   order by l.logged_in_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 200));
end $$;

-- ---------- Admin: platform report -------------------------------------------

create or replace function public.admin_report() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'businesses',     (select count(*) from public.organisations),
      'active',         (select count(*) from public.organisations where status = 'Active'),
      'suspended',      (select count(*) from public.organisations where status = 'Suspended'),
      'users',          (select count(*) from public.profiles),
      'assets',         (select count(*) from public.assets),
      'asset_value',    (select coalesce(sum(value), 0) from public.assets),
      'logins_total',   (select count(*) from public.login_events),
      'logins_7d',      (select count(*) from public.login_events where logged_in_at > now() - interval '7 days'),
      'active_users_7d',(select count(distinct user_id) from public.login_events where logged_in_at > now() - interval '7 days')
    ),
    'assets_by_status', coalesce((select jsonb_object_agg(s.status, s.n)
                                    from (select status, count(*) n from public.assets group by status) s), '{}'::jsonb),
    'orgs_by_sector',   coalesce((select jsonb_object_agg(s.sector, s.n)
                                    from (select sector, count(*) n from public.organisations group by sector) s), '{}'::jsonb),
    'orgs_by_plan',     coalesce((select jsonb_object_agg(s.plan, s.n)
                                    from (select plan, count(*) n from public.organisations group by plan) s), '{}'::jsonb),
    'top_orgs',         coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'assets', t.n) order by t.n desc, t.name)
                                    from (select o.name, count(a.id) n
                                            from public.organisations o left join public.assets a on a.org_id = o.id
                                           group by o.id order by count(a.id) desc, o.name limit 8) t), '[]'::jsonb),
    'new_orgs_by_month',(select jsonb_agg(jsonb_build_object('label', to_char(m.d, 'Mon'),
                                  'n', (select count(*) from public.organisations o
                                         where date_trunc('month', o.created_at) = m.d)) order by m.d)
                           from generate_series(date_trunc('month', now()) - interval '5 months',
                                                date_trunc('month', now()), interval '1 month') as m(d)),
    'logins_by_day',    (select jsonb_agg(jsonb_build_object('label', to_char(d.d, 'DD Mon'),
                                  'n', (select count(*) from public.login_events l
                                         where l.logged_in_at >= d.d and l.logged_in_at < d.d + interval '1 day')) order by d.d)
                           from generate_series(date_trunc('day', now()) - interval '13 days',
                                                date_trunc('day', now()), interval '1 day') as d(d))
  );
end $$;

-- ---------- Who may call what ---------------------------------------------------
revoke execute on function public.record_login()                           from public, anon;
revoke execute on function public.admin_orgs()                             from public, anon;
revoke execute on function public.admin_set_org_status(uuid, text, text)   from public, anon;
revoke execute on function public.admin_set_org_notes(uuid, text)          from public, anon;
revoke execute on function public.admin_assets()                           from public, anon;
revoke execute on function public.admin_set_asset_status(uuid, text)       from public, anon;
revoke execute on function public.admin_login_summary()                    from public, anon;
revoke execute on function public.admin_recent_logins(int)                 from public, anon;
revoke execute on function public.admin_report()                           from public, anon;

grant execute on function public.record_login()                            to authenticated;
grant execute on function public.admin_orgs()                              to authenticated;
grant execute on function public.admin_set_org_status(uuid, text, text)    to authenticated;
grant execute on function public.admin_set_org_notes(uuid, text)           to authenticated;
grant execute on function public.admin_assets()                            to authenticated;
grant execute on function public.admin_set_asset_status(uuid, text)        to authenticated;
grant execute on function public.admin_login_summary()                     to authenticated;
grant execute on function public.admin_recent_logins(int)                  to authenticated;
grant execute on function public.admin_report()                            to authenticated;
-- (the functions above all check is_platform_admin() themselves; record_login is for any signed-in user)