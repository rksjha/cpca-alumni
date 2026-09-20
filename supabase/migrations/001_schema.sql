-- CPCA Alumni Network — database blueprint
-- Privacy model:
--   * Anyone can see APPROVED profiles (name, batch, headline, company, location).
--   * Email / phone / staff count / turnover are visible to approved members only
--     (each alumnus can switch their own contact card to public or hidden).
--   * New joiners stay 'pending' until an administrator approves them.
--   * Members can never change their own status, badge or ownership (column grants + RPCs).

create schema if not exists private;

-- ───────────────────────────── Tables ─────────────────────────────

create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users(id) on delete set null,
  full_name        text not null check (char_length(full_name) between 2 and 120),
  headline         text check (char_length(headline) <= 200),
  about            text check (char_length(about) <= 3000),
  photo_url        text check (char_length(photo_url) <= 500),
  location         text check (char_length(location) <= 200),
  sector           text check (char_length(sector) <= 80),
  batch_year       int  check (batch_year between 1950 and 2100),
  links            jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending','approved','suspended')),
  is_distinguished boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.profile_private (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email      text check (char_length(email) <= 200),
  phone      text check (char_length(phone) <= 40),
  whatsapp   text check (char_length(whatsapp) <= 40),
  visibility text not null default 'members' check (visibility in ('members','public','hidden'))
);

create table public.education (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  level       text check (level in ('UG','PG','PhD','Diploma','Other')),
  program     text check (char_length(program) <= 160),
  institution text check (char_length(institution) <= 200),
  college     text check (char_length(college) <= 200),
  start_year  int check (start_year between 1940 and 2100),
  end_year    int check (end_year between 1940 and 2100),
  is_cpca     boolean not null default false
);
create index education_profile_idx on public.education(profile_id);

create table public.experience (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  organisation text not null check (char_length(organisation) <= 200),
  title        text check (char_length(title) <= 160),
  location     text check (char_length(location) <= 200),
  start_year   int check (start_year between 1940 and 2100),
  end_year     int check (end_year between 1940 and 2100),
  is_current   boolean not null default false,
  description  text check (char_length(description) <= 2000)
);
create index experience_profile_idx on public.experience(profile_id);

create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  name             text not null check (char_length(name) <= 300),
  role             text check (char_length(role) <= 120),
  description      text check (char_length(description) <= 2000),
  location         text check (char_length(location) <= 200),
  website          text check (char_length(website) <= 300),
  year_established int check (year_established between 1800 and 2100)
);
create index companies_profile_idx on public.companies(profile_id);

-- Members-only company figures
create table public.company_stats (
  company_id uuid primary key references public.companies(id) on delete cascade,
  employees  int check (employees >= 0),
  turnover   text check (char_length(turnover) <= 60)
);

create table public.admin_emails (
  email text primary key check (email = lower(email))
);

-- Emails from the college's sheet, used only to let those alumni claim their ready-made profile.
-- No policies on purpose: nobody can read this table through the API.
create table public.claim_seeds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email      text not null unique check (email = lower(email))
);

-- ───────────────────────── Helper functions ─────────────────────────

create function private.verified_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_emails a where a.email = private.verified_email())
$$;

create function private.my_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.user_id = auth.uid()
$$;

create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.status = 'approved')
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();

grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;

-- ───────────────────────── Row-level security ─────────────────────────

alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.education       enable row level security;
alter table public.experience      enable row level security;
alter table public.companies       enable row level security;
alter table public.company_stats   enable row level security;
alter table public.admin_emails    enable row level security;
alter table public.claim_seeds     enable row level security;

-- profiles: read approved / own / admin; members edit only safe columns of their own row
create policy profiles_read on public.profiles for select
  using (status = 'approved' or user_id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_edit_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, headline, about, photo_url, location, sector, batch_year, links)
  on public.profiles to authenticated;

-- contact card
create policy private_read on public.profile_private for select using (
  profile_id = (select private.my_profile_id())
  or (select private.is_admin())
  or (
    exists (select 1 from public.profiles p where p.id = profile_id and p.status = 'approved')
    and (visibility = 'public' or (visibility = 'members' and (select private.is_member())))
  )
);
create policy private_insert_own on public.profile_private for insert to authenticated
  with check (profile_id = (select private.my_profile_id()));
create policy private_edit_own on public.profile_private for update to authenticated
  using (profile_id = (select private.my_profile_id()))
  with check (profile_id = (select private.my_profile_id()));
revoke delete on public.profile_private from anon, authenticated;
revoke insert, update on public.profile_private from anon;

-- education / experience / companies: visible whenever the parent profile is visible; owner writes
create policy education_read on public.education for select
  using (exists (select 1 from public.profiles p where p.id = profile_id));
create policy education_write on public.education for all to authenticated
  using (profile_id = (select private.my_profile_id()))
  with check (profile_id = (select private.my_profile_id()));

create policy experience_read on public.experience for select
  using (exists (select 1 from public.profiles p where p.id = profile_id));
create policy experience_write on public.experience for all to authenticated
  using (profile_id = (select private.my_profile_id()))
  with check (profile_id = (select private.my_profile_id()));

create policy companies_read on public.companies for select
  using (exists (select 1 from public.profiles p where p.id = profile_id));
create policy companies_write on public.companies for all to authenticated
  using (profile_id = (select private.my_profile_id()))
  with check (profile_id = (select private.my_profile_id()));

revoke insert, update, delete on public.education, public.experience, public.companies from anon;

-- company figures: approved members, the owner and admins only
create policy stats_read on public.company_stats for select to authenticated using (
  (select private.is_member()) or (select private.is_admin())
  or exists (select 1 from public.companies c
             where c.id = company_id and c.profile_id = (select private.my_profile_id()))
);
create policy stats_write on public.company_stats for all to authenticated
  using (exists (select 1 from public.companies c
                 where c.id = company_id and c.profile_id = (select private.my_profile_id())))
  with check (exists (select 1 from public.companies c
                      where c.id = company_id and c.profile_id = (select private.my_profile_id())));
-- anon keeps SELECT (so public profile pages can embed this table) but the policy above gives it no rows
revoke insert, update, delete on public.company_stats from anon;

-- administrators manage the admin list
create policy admins_manage on public.admin_emails for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.admin_emails from anon;

revoke all on public.claim_seeds from anon, authenticated;

-- ───────────────────────── Actions (RPCs) ─────────────────────────

-- Called once after sign-in. Returns the member's profile id:
-- their existing one, the college-listed profile matching their verified email, or a new pending one.
create function public.join_network(p_full_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := private.verified_email();
  v_id    uuid;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;

  select id into v_id from public.profiles where user_id = v_uid;
  if v_id is not null then return v_id; end if;

  if v_email is not null then
    select s.profile_id into v_id
    from public.claim_seeds s join public.profiles p on p.id = s.profile_id
    where s.email = v_email and p.user_id is null;
    if v_id is not null then
      update public.profiles set user_id = v_uid where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.profiles (user_id, full_name)
  values (v_uid, left(coalesce(nullif(trim(p_full_name), ''), initcap(split_part(v_email, '@', 1)), 'New member'), 120))
  returning id into v_id;
  insert into public.profile_private (profile_id, email) values (v_id, v_email);
  return v_id;
end $$;

create function public.admin_set_status(p_profile uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrators only'; end if;
  if p_status not in ('pending','approved','suspended') then raise exception 'Unknown status'; end if;
  update public.profiles set status = p_status where id = p_profile;
end $$;

create function public.admin_set_distinguished(p_profile uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrators only'; end if;
  update public.profiles set is_distinguished = p_value where id = p_profile;
end $$;

create function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_admin() $$;

revoke execute on function public.join_network(text), public.admin_set_status(uuid, text),
  public.admin_set_distinguished(uuid, boolean), public.am_i_admin() from public, anon;
grant execute on function public.join_network(text), public.admin_set_status(uuid, text),
  public.admin_set_distinguished(uuid, boolean), public.am_i_admin() to authenticated;

-- ───────────────────────── Profile photos ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
