-- =====================================================================
-- Winter Arc v0.2 — пати, лента, «пнуть», синхронизация.
-- Вставь ВЕСЬ файл в Supabase → SQL Editor → Run. Повторный запуск безопасен.
--
-- Принципы:
--   * RLS включён на всех таблицах; права выдаются только роли `authenticated`,
--     у `anon` нет ничего.
--   * Членство в пати, «пнуть» и удаление аккаунта — только через RPC.
--   * SECURITY DEFINER функции: `set search_path = ''`, все имена полные.
--   * Аккаунт = ник + пароль; e-mail синтетический: <nick>@winter-arc.invalid
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nick         text not null unique,
  display_name text not null default '',
  avatar       text not null default '❄️',
  created_at   timestamptz not null default now(),
  constraint profiles_nick_format check (nick ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(display_name) <= 24),
  constraint profiles_avatar_len check (char_length(avatar) between 1 and 16)
);

create table if not exists public.parties (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  owner      uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint parties_name_len check (char_length(btrim(name)) between 1 and 32),
  constraint parties_code_format check (code ~ '^[A-Z]{3,5}-[0-9]{4}$')
);

create table if not exists public.party_members (
  party_id  uuid not null references public.parties (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create index if not exists party_members_user_idx on public.party_members (user_id);

create table if not exists public.public_stats (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint public_stats_size check (octet_length(payload::text) < 32768)
);

create table if not exists public.feed_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  party_id   uuid not null references public.parties (id) on delete cascade,
  kind       text not null,
  -- dedupe key («slip:<id>», «level:5», «check:3»): one event per thing, even from two devices
  key        text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint feed_events_kind check (kind in ('slip', 'comeback', 'perfect', 'boss', 'level', 'book', 'check', 'join')),
  constraint feed_events_key_len check (char_length(key) between 1 and 64),
  constraint feed_events_payload_size check (octet_length(payload::text) < 2048),
  constraint feed_events_dedupe unique (party_id, user_id, key)
);
create index if not exists feed_events_party_idx on public.feed_events (party_id, created_at desc);
create index if not exists feed_events_user_idx on public.feed_events (user_id);

create table if not exists public.reactions (
  event_id   bigint not null references public.feed_events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint reactions_emoji_len check (char_length(emoji) between 1 and 8)
);
create index if not exists reactions_user_idx on public.reactions (user_id);

create table if not exists public.nudges (
  id         bigint generated always as identity primary key,
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  party_id   uuid references public.parties (id) on delete set null,
  kind       text not null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz,
  constraint nudges_kind check (kind in ('wake', 'confess', 'read', 'hold')),
  constraint nudges_not_self check (from_user <> to_user)
);
create index if not exists nudges_to_idx on public.nudges (to_user, created_at desc);
create index if not exists nudges_pair_idx on public.nudges (from_user, to_user, created_at desc);

create table if not exists public.private_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  rev        bigint not null default 1,
  updated_at timestamptz not null default now(),
  device     text,
  constraint private_state_size check (octet_length(data::text) < 2097152),
  constraint private_state_device_len check (device is null or char_length(device) <= 64)
);

-- failed join attempts (brute-force protection for party codes); touched only by join_party()
create table if not exists public.party_join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists party_join_attempts_idx on public.party_join_attempts (user_id, at desc);

-- ---------------------------------------------------------------------
-- 2. Служебные функции (для политик RLS)
-- ---------------------------------------------------------------------

create or replace function public.is_party_member(p_party uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.party_members m
    where m.party_id = p_party and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_party(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.party_members a
    join public.party_members b on b.party_id = a.party_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

create or replace function public.can_see_event(p_event bigint)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feed_events e
    join public.party_members m on m.party_id = e.party_id
    where e.id = p_event and m.user_id = (select auth.uid())
  );
$$;

-- storage path «{party_id}/{user_id}/{week}.jpg»
create or replace function public.can_read_check(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if coalesce(array_length(parts, 1), 0) <> 3 then return false; end if;
  if parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.is_party_member(parts[1]::uuid);
end;
$$;

create or replace function public.can_write_check(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if coalesce(array_length(parts, 1), 0) <> 3 then return false; end if;
  if (select auth.uid()) is null or parts[2] <> (select auth.uid())::text then return false; end if;
  if parts[3] !~ '^[0-9]{1,2}\.jpg$' then return false; end if;
  if parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.is_party_member(parts[1]::uuid);
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_stats_touch on public.public_stats;
create trigger public_stats_touch before insert or update on public.public_stats
  for each row execute function public.touch_updated_at();

drop trigger if exists private_state_touch on public.private_state;
create trigger private_state_touch before insert or update on public.private_state
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS + права
-- ---------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.parties             enable row level security;
alter table public.party_members       enable row level security;
alter table public.public_stats        enable row level security;
alter table public.feed_events         enable row level security;
alter table public.reactions           enable row level security;
alter table public.nudges              enable row level security;
alter table public.private_state       enable row level security;
alter table public.party_join_attempts enable row level security;

-- start from zero, then grant exactly what the client needs
revoke all on table
  public.profiles, public.parties, public.party_members, public.public_stats, public.feed_events,
  public.reactions, public.nudges, public.private_state, public.party_join_attempts
from anon, authenticated, public;

grant select on table public.profiles to authenticated;
grant insert (id, nick, display_name, avatar) on table public.profiles to authenticated;
grant update (display_name, avatar) on table public.profiles to authenticated;

grant select on table public.parties to authenticated;
grant select on table public.party_members to authenticated;

grant select, insert, update on table public.public_stats to authenticated;

grant select, delete on table public.feed_events to authenticated;
grant insert (user_id, party_id, kind, key, payload) on table public.feed_events to authenticated;

grant select, delete on table public.reactions to authenticated;
grant insert (event_id, user_id, emoji) on table public.reactions to authenticated;
grant update (event_id, user_id, emoji) on table public.reactions to authenticated;

grant select on table public.nudges to authenticated;
grant update (seen_at) on table public.nudges to authenticated;

grant select, insert, update, delete on table public.private_state to authenticated;
-- party_join_attempts: no client access at all

-- identity sequences (harmless if not strictly needed)
do $$
declare s text;
begin
  for s in select unnest(array[
    pg_get_serial_sequence('public.feed_events', 'id'),
    pg_get_serial_sequence('public.nudges', 'id')
  ]) loop
    if s is not null then
      execute format('revoke all on sequence %s from anon, public', s);
      execute format('grant usage, select on sequence %s to authenticated', s);
    end if;
  end loop;
end $$;

-- profiles: self + people from my parties; the nick must match the login
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_party(id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and (select auth.jwt() ->> 'email') = nick || '@winter-arc.invalid'
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- parties / members: visible to members; writes only through RPC
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties for select to authenticated
  using (public.is_party_member(id));

drop policy if exists party_members_select on public.party_members;
create policy party_members_select on public.party_members for select to authenticated
  using (public.is_party_member(party_id));

-- public stats
drop policy if exists public_stats_select on public.public_stats;
create policy public_stats_select on public.public_stats for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_party(user_id));

drop policy if exists public_stats_insert on public.public_stats;
create policy public_stats_insert on public.public_stats for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists public_stats_update on public.public_stats;
create policy public_stats_update on public.public_stats for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- feed
drop policy if exists feed_events_select on public.feed_events;
create policy feed_events_select on public.feed_events for select to authenticated
  using (public.is_party_member(party_id));

drop policy if exists feed_events_insert on public.feed_events;
create policy feed_events_insert on public.feed_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and kind <> 'join'
    and public.is_party_member(party_id)
  );

drop policy if exists feed_events_delete on public.feed_events;
create policy feed_events_delete on public.feed_events for delete to authenticated
  using (user_id = (select auth.uid()));

-- reactions
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_see_event(event_id));

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_event(event_id));

drop policy if exists reactions_update on public.reactions;
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_see_event(event_id));

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- nudges: read by sender/receiver, receiver marks seen; sending only via send_nudge()
drop policy if exists nudges_select on public.nudges;
create policy nudges_select on public.nudges for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

drop policy if exists nudges_update on public.nudges;
create policy nudges_update on public.nudges for update to authenticated
  using (to_user = (select auth.uid()))
  with check (to_user = (select auth.uid()));

-- private state: owner only
drop policy if exists private_state_select on public.private_state;
create policy private_state_select on public.private_state for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists private_state_insert on public.private_state;
create policy private_state_insert on public.private_state for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists private_state_update on public.private_state;
create policy private_state_update on public.private_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists private_state_delete on public.private_state;
create policy private_state_delete on public.private_state for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------

create or replace function public.gen_party_code()
returns text
language sql volatile
set search_path = ''
as $$
  select (array['SNOW', 'FROST', 'ICE', 'PINE', 'NORD', 'YETI', 'STAR', 'WOLF', 'LYNX', 'BEAR', 'FIR', 'OWL'])
           [1 + floor(random() * 12)::int]
         || '-' || (1000 + floor(random() * 9000)::int)::text;
$$;

-- create_party(name) → {id, name, code, owner, created_at}; the creator joins automatically
create or replace function public.create_party(p_name text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_party public.parties;
  v_try   int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 32 then raise exception 'bad_name'; end if;
  if (select count(*) from public.party_members where user_id = v_uid) >= 3 then raise exception 'too_many_parties'; end if;

  loop
    begin
      insert into public.parties (name, code, owner)
      values (v_name, public.gen_party_code(), v_uid)
      returning * into v_party;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 30 then raise exception 'code_space_exhausted'; end if;
    end;
  end loop;

  insert into public.party_members (party_id, user_id) values (v_party.id, v_uid);
  return to_jsonb(v_party);
end;
$$;

-- join_party(code) → {party} | {party, already: true} | {error: invalid_code|party_full|rate_limited|too_many_parties}
create or replace function public.join_party(p_code text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_party public.parties;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;

  if (select count(*) from public.party_join_attempts
      where user_id = v_uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  -- «snow4821», «SNOW 4821», «snow-4821» all work
  if v_code ~ '^[A-Z]{3,5}[0-9]{4}$' then
    v_code := regexp_replace(v_code, '^([A-Z]{3,5})([0-9]{4})$', '\1-\2');
  end if;

  select * into v_party from public.parties where code = v_code for update;
  if not found then
    insert into public.party_join_attempts (user_id) values (v_uid);
    return jsonb_build_object('error', 'invalid_code');
  end if;

  if exists (select 1 from public.party_members where party_id = v_party.id and user_id = v_uid) then
    return jsonb_build_object('party', to_jsonb(v_party), 'already', true);
  end if;
  if (select count(*) from public.party_members where user_id = v_uid) >= 3 then
    return jsonb_build_object('error', 'too_many_parties');
  end if;
  if (select count(*) from public.party_members where party_id = v_party.id) >= 8 then
    return jsonb_build_object('error', 'party_full');
  end if;

  insert into public.party_members (party_id, user_id) values (v_party.id, v_uid);
  insert into public.feed_events (user_id, party_id, kind, key, payload)
  values (v_uid, v_party.id, 'join', 'join', '{}'::jsonb)
  on conflict (party_id, user_id, key) do nothing;

  return jsonb_build_object('party', to_jsonb(v_party));
end;
$$;

-- leave_party(party_id): removes me and my feed events there; the oldest member inherits ownership;
-- an empty party is deleted
create or replace function public.leave_party(p_party uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.parties where id = p_party for update;
  delete from public.party_members where party_id = p_party and user_id = v_uid;
  if not found then return; end if;
  delete from public.feed_events where party_id = p_party and user_id = v_uid;

  if not exists (select 1 from public.party_members where party_id = p_party) then
    delete from public.parties where id = p_party;
  else
    update public.parties p
       set owner = (select m.user_id from public.party_members m
                     where m.party_id = p_party order by m.joined_at, m.user_id limit 1)
     where p.id = p_party and (p.owner is null or p.owner = v_uid);
  end if;
end;
$$;

-- regenerate_party_code(party_id) → new code (owner only)
create or replace function public.regenerate_party_code(p_party uuid)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_try  int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.parties where id = p_party and owner = v_uid) then
    raise exception 'not_owner';
  end if;
  loop
    begin
      v_code := public.gen_party_code();
      update public.parties set code = v_code where id = p_party;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 30 then raise exception 'code_space_exhausted'; end if;
    end;
  end loop;
  return v_code;
end;
$$;

-- send_nudge(to_user, kind) → {id} | {error: rate_limited, retry_at}
create or replace function public.send_nudge(p_to uuid, p_kind text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_party uuid;
  v_last  timestamptz;
  v_id    bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_to is null or p_to = v_uid then raise exception 'bad_target'; end if;
  if p_kind is null or p_kind not in ('wake', 'confess', 'read', 'hold') then raise exception 'bad_kind'; end if;

  select a.party_id into v_party
  from public.party_members a
  join public.party_members b on b.party_id = a.party_id
  where a.user_id = v_uid and b.user_id = p_to
  order by a.joined_at
  limit 1;
  if v_party is null then raise exception 'not_in_party'; end if;

  -- serialize concurrent sends for the same pair, then rate-limit 1 per 60 min
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || '>' || p_to::text, 0));
  select max(created_at) into v_last from public.nudges
   where from_user = v_uid and to_user = p_to and created_at > now() - interval '60 minutes';
  if v_last is not null then
    return jsonb_build_object('error', 'rate_limited', 'retry_at', v_last + interval '60 minutes');
  end if;

  insert into public.nudges (from_user, to_user, party_id, kind)
  values (v_uid, p_to, v_party, p_kind)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- delete_my_account(): hands my parties over (or deletes the empty ones), then deletes the auth user;
-- everything else goes by ON DELETE CASCADE. Screenshots in Storage are removed by the client first
-- (Supabase forbids deleting storage.objects from SQL).
create or replace function public.delete_my_account()
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.parties p
   where exists (select 1 from public.party_members m where m.party_id = p.id and m.user_id = v_uid)
     and not exists (select 1 from public.party_members m where m.party_id = p.id and m.user_id <> v_uid);

  update public.parties p
     set owner = (select m.user_id from public.party_members m
                   where m.party_id = p.id and m.user_id <> v_uid
                   order by m.joined_at, m.user_id limit 1)
   where p.owner = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

-- function privileges: nothing for anon/public, everything needed for authenticated
revoke all on function public.is_party_member(uuid)        from public, anon;
revoke all on function public.shares_party(uuid)           from public, anon;
revoke all on function public.can_see_event(bigint)        from public, anon;
revoke all on function public.can_read_check(text)         from public, anon;
revoke all on function public.can_write_check(text)        from public, anon;
revoke all on function public.touch_updated_at()           from public, anon;
revoke all on function public.gen_party_code()             from public, anon, authenticated;
revoke all on function public.create_party(text)           from public, anon;
revoke all on function public.join_party(text)             from public, anon;
revoke all on function public.leave_party(uuid)            from public, anon;
revoke all on function public.regenerate_party_code(uuid)  from public, anon;
revoke all on function public.send_nudge(uuid, text)       from public, anon;
revoke all on function public.delete_my_account()          from public, anon;

grant execute on function public.touch_updated_at()          to authenticated;
grant execute on function public.is_party_member(uuid)       to authenticated;
grant execute on function public.shares_party(uuid)          to authenticated;
grant execute on function public.can_see_event(bigint)       to authenticated;
grant execute on function public.can_read_check(text)        to authenticated;
grant execute on function public.can_write_check(text)       to authenticated;
grant execute on function public.create_party(text)          to authenticated;
grant execute on function public.join_party(text)            to authenticated;
grant execute on function public.leave_party(uuid)           to authenticated;
grant execute on function public.regenerate_party_code(uuid) to authenticated;
grant execute on function public.send_nudge(uuid, text)      to authenticated;
grant execute on function public.delete_my_account()         to authenticated;

-- ---------------------------------------------------------------------
-- 5. Storage: приватный бакет «checks» для скринов «Экранного времени»
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checks', 'checks', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists checks_select on storage.objects;
create policy checks_select on storage.objects for select to authenticated
  using (bucket_id = 'checks' and public.can_read_check(name));

drop policy if exists checks_insert on storage.objects;
create policy checks_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checks' and public.can_write_check(name));

drop policy if exists checks_update on storage.objects;
create policy checks_update on storage.objects for update to authenticated
  using (bucket_id = 'checks' and public.can_write_check(name))
  with check (bucket_id = 'checks' and public.can_write_check(name));

drop policy if exists checks_delete on storage.objects;
create policy checks_delete on storage.objects for delete to authenticated
  using (bucket_id = 'checks' and split_part(name, '/', 2) = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['feed_events', 'reactions', 'nudges', 'public_stats'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- make PostgREST see the new tables right away
notify pgrst, 'reload schema';
