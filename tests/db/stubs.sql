-- Stubs mínimos do Supabase para validar as migrations em Postgres puro.
-- (auth.users, auth.uid(), storage, publication realtime e roles.)
-- Uso: psql -f tests/db/stubs.sql -f supabase/migrations/0001_schema.sql ...

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

-- auth.uid() lê a sessão simulada (app.uid)
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean not null default false
);
create table if not exists storage.objects (
  bucket_id text,
  name text,
  primary key (bucket_id, name)
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(p_name text) returns text[]
  language sql immutable as $$ select string_to_array(p_name, '/') $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
