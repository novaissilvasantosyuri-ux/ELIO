-- ============================================================
-- ELIO — 0007: comunidades e canais (Fase 3)
-- Comunidade = grupo de canais. Canal = conversa tipo 'channel' ligada à
-- comunidade. Entrar na comunidade adiciona a todos os canais (espelho em
-- conversation_members); sair remove. Canal de anúncios: só dono/admin posta.
-- Papéis: owner > admin > moderator > member (moderador ganha poderes na Fase 4+).
-- ============================================================

-- ---------- tabelas ----------

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  avatar_url text null,
  invite_code text null,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'communities_invite_unique') then
    alter table public.communities add constraint communities_invite_unique unique (invite_code);
  end if;
end $$;

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index cmembers_user_idx on public.community_members (user_id);

-- ---------- colunas em conversations ----------

alter table public.conversations
  add column if not exists community_id uuid null references public.communities (id) on delete cascade,
  add column if not exists is_announcement boolean not null default false;
create index if not exists conversations_community_idx
  on public.conversations (community_id) where community_id is not null;

-- ---------- bucket público de avatares de comunidade ----------

insert into storage.buckets (id, name, public)
values ('community-avatars', 'community-avatars', true)
on conflict (id) do update set public = true;
drop policy if exists "public read community-avatars" on storage.objects;
create policy "public read community-avatars" on storage.objects
  for select to anon, authenticated using (bucket_id = 'community-avatars');
-- escrita só pela service role (rota valida admin+).

-- ---------- RLS ----------

alter table public.communities enable row level security;
alter table public.community_members enable row level security;

create or replace function public.is_community_member(p_comm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_comm and user_id = auth.uid()
  );
$$;

create or replace function public.my_community_role(p_comm uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.community_members
  where community_id = p_comm and user_id = auth.uid();
$$;

create policy "communities_select_member" on public.communities
  for select to authenticated using (public.is_community_member(id));
create policy "cmembers_select_same" on public.community_members
  for select to authenticated using (public.is_community_member(community_id));
-- escrita somente via RPCs/rotas validadas.

-- ---------- RPC: criar comunidade (nasce com #geral + #anúncios) ----------

create or replace function public.create_community(p_name text, p_description text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  cid uuid;
  general uuid;
  news uuid;
  code text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if v_name = '' or char_length(v_name) > 60 then raise exception 'invalid_title'; end if;
  if char_length(v_desc) > 300 then raise exception 'invalid_description'; end if;

  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.communities c where c.invite_code = code);
  end loop;
  insert into public.communities (name, description, created_by, invite_code)
  values (v_name, v_desc, me_id, code) returning id into cid;
  insert into public.community_members (community_id, user_id, role)
  values (cid, me_id, 'owner');

  insert into public.conversations (type, title, community_id, is_announcement, created_by)
  values ('channel', 'geral', cid, false, me_id) returning id into general;
  insert into public.conversations (type, title, community_id, is_announcement, created_by)
  values ('channel', 'anúncios', cid, true, me_id) returning id into news;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (general, me_id, 'member'), (news, me_id, 'member');

  perform public.sys_msg(general, 'Canal #geral criado. Boas conversas! 👋');
  return jsonb_build_object('id', cid);
end;
$$;

-- ---------- RPC: minhas comunidades ----------

create or replace function public.get_communities()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description,
      'avatar_url', c.avatar_url, 'my_role', cm.role,
      'members_count', (select count(*) from public.community_members x where x.community_id = c.id),
      'channels', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', ch.id, 'title', ch.title, 'is_announcement', ch.is_announcement,
          'last_message_at', ch.last_message_at) order by ch.is_announcement desc, ch.title), '[]'::jsonb)
        from public.conversations ch
        where ch.community_id = c.id and ch.type = 'channel'
      ))
      order by c.name), '[]'::jsonb)
    from public.community_members cm
    join public.communities c on c.id = cm.community_id
    where cm.user_id = me_id
  );
end;
$$;

-- ---------- RPC: detalhe da comunidade (membros + canais) ----------

create or replace function public.get_community(p_comm uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  comm public.communities%rowtype;
  v_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into comm from public.communities where id = p_comm;
  if not found then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is null then raise exception 'forbidden'; end if;

  return jsonb_build_object(
    'community', jsonb_build_object(
      'id', comm.id, 'name', comm.name, 'description', comm.description,
      'avatar_url', comm.avatar_url, 'invite_code', comm.invite_code,
      'members_count', (select count(*) from public.community_members x where x.community_id = p_comm)),
    'my_role', v_role,
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ch.id, 'title', ch.title, 'is_announcement', ch.is_announcement,
        'last_message_at', ch.last_message_at) order by ch.is_announcement desc, ch.title), '[]'::jsonb)
      from public.conversations ch
      where ch.community_id = p_comm and ch.type = 'channel'
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'presence', p.presence,
        'role', m.role, 'joined_at', m.joined_at)
        order by case m.role when 'owner' then 0 when 'admin' then 1
                             when 'moderator' then 2 else 3 end, p.display_name), '[]'::jsonb)
      from public.community_members m
      join public.profiles p on p.id = m.user_id
      where m.community_id = p_comm
        and not public.is_blocked_between(me_id, m.user_id)
    ));
end;
$$;

-- ---------- RPC: editar comunidade (admin+) ----------

create or replace function public.update_community(p_comm uuid, p_name text default null,
  p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  v_name text;
  v_desc text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;

  if p_name is not null then
    v_name := btrim(p_name);
    if v_name = '' or char_length(v_name) > 60 then raise exception 'invalid_title'; end if;
    update public.communities set name = v_name, updated_at = now() where id = p_comm;
  end if;
  if p_description is not null then
    v_desc := btrim(p_description);
    if char_length(v_desc) > 300 then raise exception 'invalid_description'; end if;
    update public.communities set description = v_desc, updated_at = now() where id = p_comm;
  end if;
  return jsonb_build_object('updated', true);
end;
$$;

-- ---------- RPC: convite da comunidade (admin+) ----------

create or replace function public.rotate_community_invite(p_comm uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  code text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.communities c where c.invite_code = code);
  end loop;
  update public.communities set invite_code = code, updated_at = now() where id = p_comm;
  return jsonb_build_object('code', code);
end;
$$;

-- ---------- RPC: entrar direto / por convite ----------

create or replace function public.join_community(p_comm uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  my_name text;
  ch uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  if public.is_community_member(p_comm) then
    return jsonb_build_object('id', p_comm, 'joined', false);
  end if;
  if (select count(*) from public.community_members where community_id = p_comm) >= 1000 then
    raise exception 'full';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (p_comm, me_id, 'member');
  -- espelho: entra em todos os canais
  insert into public.conversation_members (conversation_id, user_id, role)
  select ch.id, me_id, 'member' from public.conversations ch
  where ch.community_id = p_comm and ch.type = 'channel'
  on conflict do nothing;

  select display_name into my_name from public.profiles where id = me_id;
  for ch in select ch.id from public.conversations ch
            where ch.community_id = p_comm and ch.type = 'channel'
            order by ch.is_announcement, ch.title limit 1 loop
    perform public.sys_msg(ch, coalesce(my_name, 'Alguém') || ' entrou na comunidade');
  end loop;
  return jsonb_build_object('id', p_comm, 'joined', true);
end;
$$;

create or replace function public.join_community_by_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  code text := btrim(coalesce(p_code, ''));
  cid uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select c.id into cid from public.communities c where c.invite_code = code;
  if not found then raise exception 'bad_code'; end if;
  return public.join_community(cid);
end;
$$;

-- ---------- RPC: sair (dono transfere; último apaga tudo) ----------

create or replace function public.leave_community(p_comm uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  my_name text;
  next_owner uuid;
  next_name text;
  ch uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is null then raise exception 'not_member'; end if;

  if (select count(*) from public.community_members where community_id = p_comm) = 1 then
    delete from public.communities where id = p_comm;
    return jsonb_build_object('deleted', true);
  end if;

  select display_name into my_name from public.profiles where id = me_id;
  delete from public.community_members where community_id = p_comm and user_id = me_id;
  delete from public.conversation_members m using public.conversations ch
  where m.conversation_id = ch.id and ch.community_id = p_comm and m.user_id = me_id;

  for ch in select ch.id from public.conversations ch
            where ch.community_id = p_comm and ch.type = 'channel'
            order by ch.is_announcement, ch.title limit 1 loop
    perform public.sys_msg(ch, coalesce(my_name, 'Alguém') || ' saiu da comunidade');
  end loop;

  if v_role = 'owner' then
    select m.user_id into next_owner from public.community_members m
    where m.community_id = p_comm order by m.joined_at, m.user_id limit 1;
    update public.community_members set role = 'owner'
    where community_id = p_comm and user_id = next_owner;
    select display_name into next_name from public.profiles where id = next_owner;
    for ch in select ch.id from public.conversations ch
              where ch.community_id = p_comm and ch.type = 'channel'
              order by ch.is_announcement, ch.title limit 1 loop
      perform public.sys_msg(ch, coalesce(next_name, 'Alguém') || ' agora é dono da comunidade');
    end loop;
  end if;
  return jsonb_build_object('deleted', false);
end;
$$;

-- ---------- RPC: papéis (só o dono) ----------

create or replace function public.set_community_role(p_comm uuid, p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  target_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_role not in ('owner', 'admin', 'moderator', 'member') then raise exception 'bad_role'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is distinct from 'owner' then raise exception 'needs_owner'; end if;
  if p_user = me_id then raise exception 'self'; end if;
  select m.role into target_role from public.community_members m
  where m.community_id = p_comm and m.user_id = p_user;
  if target_role is null then raise exception 'not_member'; end if;

  if p_role = 'owner' then
    update public.community_members set role = 'admin'
    where community_id = p_comm and user_id = me_id;
    update public.community_members set role = 'owner'
    where community_id = p_comm and user_id = p_user;
  else
    update public.community_members set role = p_role
    where community_id = p_comm and user_id = p_user;
  end if;
  return jsonb_build_object('role', p_role);
end;
$$;

-- ---------- RPC: remover da comunidade (admin+) ----------

create or replace function public.remove_community_member(p_comm uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  target_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  if p_user = me_id then raise exception 'use_leave'; end if;
  select m.role into target_role from public.community_members m
  where m.community_id = p_comm and m.user_id = p_user;
  if target_role is null then raise exception 'not_member'; end if;
  if target_role = 'owner' then raise exception 'cannot_remove_owner'; end if;

  delete from public.community_members where community_id = p_comm and user_id = p_user;
  delete from public.conversation_members m using public.conversations ch
  where m.conversation_id = ch.id and ch.community_id = p_comm and m.user_id = p_user;
  return jsonb_build_object('removed', true);
end;
$$;

-- ---------- RPC: criar canal (admin+) ----------

create or replace function public.create_channel(p_comm uuid, p_title text, p_announcement boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  v_role text;
  v_title text := btrim(coalesce(p_title, ''));
  ch uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if v_title = '' or char_length(v_title) > 60 then raise exception 'invalid_title'; end if;
  if not exists (select 1 from public.communities where id = p_comm) then raise exception 'not_found'; end if;
  select public.my_community_role(p_comm) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  if (select count(*) from public.conversations where community_id = p_comm and type = 'channel') >= 50 then
    raise exception 'too_many';
  end if;
  if exists (select 1 from public.conversations
             where community_id = p_comm and type = 'channel' and lower(title) = lower(v_title)) then
    raise exception 'name_taken';
  end if;

  insert into public.conversations (type, title, community_id, is_announcement, created_by)
  values ('channel', v_title, p_comm, coalesce(p_announcement, false), me_id)
  returning id into ch;
  insert into public.conversation_members (conversation_id, user_id, role)
  select ch, m.user_id, 'member' from public.community_members m
  where m.community_id = p_comm on conflict do nothing;
  return jsonb_build_object('id', ch);
end;
$$;

-- ---------- RPC: editar canal (admin+) ----------

create or replace function public.update_channel(p_ch uuid, p_title text default null,
  p_announcement boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  ch public.conversations%rowtype;
  v_role text;
  v_title text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into ch from public.conversations where id = p_ch;
  if not found or ch.type <> 'channel' or ch.community_id is null then raise exception 'not_channel'; end if;
  select public.my_community_role(ch.community_id) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;

  if p_title is not null then
    v_title := btrim(p_title);
    if v_title = '' or char_length(v_title) > 60 then raise exception 'invalid_title'; end if;
    if exists (select 1 from public.conversations
               where community_id = ch.community_id and type = 'channel'
                 and id <> p_ch and lower(title) = lower(v_title)) then
      raise exception 'name_taken';
    end if;
    update public.conversations set title = v_title, updated_at = now() where id = p_ch;
  end if;
  if p_announcement is not null then
    update public.conversations set is_announcement = p_announcement, updated_at = now() where id = p_ch;
  end if;
  return jsonb_build_object('updated', true);
end;
$$;

-- ---------- RPC: apagar canal (admin+; nunca o último) ----------

create or replace function public.delete_channel(p_ch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  ch public.conversations%rowtype;
  v_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into ch from public.conversations where id = p_ch;
  if not found or ch.type <> 'channel' or ch.community_id is null then raise exception 'not_channel'; end if;
  select public.my_community_role(ch.community_id) into v_role;
  if v_role is distinct from 'owner' and v_role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  if (select count(*) from public.conversations
      where community_id = ch.community_id and type = 'channel') <= 1 then
    raise exception 'last_channel';
  end if;
  delete from public.conversations where id = p_ch;
  return jsonb_build_object('deleted', true);
end;
$$;

-- ---------- RPC: info do canal p/ o chat (papel + posso postar?) ----------

create or replace function public.get_channel_info(p_ch uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  ch public.conversations%rowtype;
  comm public.communities%rowtype;
  v_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into ch from public.conversations where id = p_ch;
  if not found or ch.type <> 'channel' or ch.community_id is null then raise exception 'not_channel'; end if;
  if not public.is_member(p_ch) then raise exception 'forbidden'; end if;
  select * into comm from public.communities where id = ch.community_id;
  select public.my_community_role(ch.community_id) into v_role;

  return jsonb_build_object(
    'conversation', jsonb_build_object('id', ch.id, 'title', ch.title,
      'is_announcement', ch.is_announcement, 'community_id', ch.community_id),
    'community', jsonb_build_object('id', comm.id, 'name', comm.name,
      'avatar_url', comm.avatar_url),
    'my_role', v_role,
    'can_post', not ch.is_announcement or v_role in ('owner', 'admin'));
end;
$$;

-- ---------- RPC: explorar (público; sem código de convite) ----------

create or replace function public.explore_communities(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  term text := '%' || btrim(coalesce(p_search, '')) || '%';
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'description', t.description,
      'avatar_url', t.avatar_url,
      'members_count', t.members_count,
      'channels_count', (select count(*) from public.conversations ch
                         where ch.community_id = t.id and ch.type = 'channel'),
      'am_member', public.is_community_member(t.id))
      order by t.members_count desc, t.name), '[]'::jsonb)
    from (
      select c.id, c.name, c.description, c.avatar_url,
             (select count(*) from public.community_members x where x.community_id = c.id) as members_count
      from public.communities c
      where term = '%%' or c.name ilike term
      order by members_count desc, c.name
      limit 30
    ) t
  );
end;
$$;

-- ---------- envio: canal de anúncios só dono/admin posta ----------

create or replace function public.send_message(
  p_conv uuid,
  p_client_id uuid,
  p_body text,
  p_reply_to uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  existing_id uuid;
  peer_id uuid;
  new_row public.messages%rowtype;
  crole text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 4000 then
    raise exception 'invalid_body';
  end if;
  select * into conv from public.conversations where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = p_conv and user_id = me_id) then
    raise exception 'forbidden';
  end if;
  if conv.type in ('official', 'system') then raise exception 'read_only'; end if;

  if conv.type = 'channel' and conv.is_announcement then
    select m.role into crole from public.community_members m
     where m.community_id = conv.community_id and m.user_id = me_id;
    if crole is distinct from 'owner' and crole is distinct from 'admin' then
      raise exception 'read_only';
    end if;
  end if;

  if conv.type = 'direct' then
    select m.user_id into peer_id from public.conversation_members m
     where m.conversation_id = p_conv and m.user_id <> me_id limit 1;
    if peer_id is not null then
      if public.is_blocked_between(me_id, peer_id) then raise exception 'blocked'; end if;
      if not public.target_allows_messages(peer_id, me_id) then raise exception 'not_allowed'; end if;
    end if;
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = p_conv
  ) then raise exception 'bad_reply'; end if;

  -- idempotência: reenvio devolve a original, sem duplicar
  select id into existing_id from public.messages
   where sender_id = me_id and client_id = p_client_id;
  if found then
    select * into new_row from public.messages where id = existing_id;
    return jsonb_build_object('message', to_jsonb(new_row), 'duplicate', true);
  end if;

  insert into public.messages (conversation_id, sender_id, client_id, type, body, reply_to_id)
  values (p_conv, me_id, p_client_id, 'text', btrim(p_body), p_reply_to)
  returning * into new_row;
  return jsonb_build_object('message', to_jsonb(new_row), 'duplicate', false);
end;
$$;

-- send_media com a mesma regra de anúncios
create or replace function public.send_media(
  p_conv uuid,
  p_client_id uuid,
  p_type text,
  p_caption text,
  p_reply_to uuid,
  p_path text,
  p_mime text,
  p_size int,
  p_filename text,
  p_width int default null,
  p_height int default null,
  p_duration int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  existing_id uuid;
  peer_id uuid;
  new_row public.messages%rowtype;
  crole text;
  caption text := btrim(coalesce(p_caption, ''));
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_type not in ('image', 'video', 'audio', 'file') then raise exception 'invalid_type'; end if;
  if char_length(caption) > 1000 then raise exception 'invalid_body'; end if;
  if p_path is null or p_path = '' or p_mime is null or p_mime = '' then raise exception 'invalid_media'; end if;
  if p_size is null or p_size <= 0 or p_size > 52428800 then raise exception 'too_big'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if not public.is_member(p_conv) then raise exception 'forbidden'; end if;
  if conv.type in ('official', 'system') then raise exception 'read_only'; end if;

  if conv.type = 'channel' and conv.is_announcement then
    select m.role into crole from public.community_members m
     where m.community_id = conv.community_id and m.user_id = me_id;
    if crole is distinct from 'owner' and crole is distinct from 'admin' then
      raise exception 'read_only';
    end if;
  end if;

  if conv.type = 'direct' then
    select m.user_id into peer_id from public.conversation_members m
     where m.conversation_id = p_conv and m.user_id <> me_id limit 1;
    if peer_id is not null then
      if public.is_blocked_between(me_id, peer_id) then raise exception 'blocked'; end if;
      if not public.target_allows_messages(peer_id, me_id) then raise exception 'not_allowed'; end if;
    end if;
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = p_conv
  ) then raise exception 'bad_reply'; end if;

  select id into existing_id from public.messages
   where sender_id = me_id and client_id = p_client_id;
  if found then
    select * into new_row from public.messages where id = existing_id;
    return jsonb_build_object('message', to_jsonb(new_row), 'duplicate', true);
  end if;

  insert into public.messages (conversation_id, sender_id, client_id, type, body, reply_to_id)
  values (p_conv, me_id, p_client_id, p_type, caption, p_reply_to)
  returning * into new_row;
  insert into public.attachments
    (message_id, storage_path, mime, size_bytes, filename, width, height, duration_s)
  values (new_row.id, p_path, p_mime, p_size, left(coalesce(p_filename, ''), 120),
          p_width, p_height, p_duration);
  return jsonb_build_object('message', to_jsonb(new_row), 'duplicate', false);
end;
$$;

-- ---------- lista de conversas: + comunidade/canal ----------

create or replace function public.get_conversations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  result jsonb;
begin
  if me_id is null then raise exception 'unauthorized'; end if;

  select coalesce(jsonb_agg(s.t order by (s.t ->> 'pinned_at') desc nulls last,
                                         (s.t ->> 'last_message_at') desc nulls last), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'id', c.id,
      'type', c.type,
      'title', case when c.type = 'direct' then coalesce(peer.display_name, '') else c.title end,
      'avatar_url', case when c.type = 'direct' then peer.avatar_url else c.avatar_url end,
      'community_id', c.community_id,
      'is_announcement', c.is_announcement,
      'last_message_at', c.last_message_at,
      'last_message', (
        select jsonb_build_object(
          'id', m.id, 'type', m.type, 'body', left(m.body, 160),
          'sender_id', m.sender_id,
          'sender_name', case when m.sender_id is null then 'Equipe ELIO'
                              when m.sender_id = me_id then 'Você'
                              else coalesce(sp.display_name, '') end,
          'created_at', m.created_at)
        from public.messages m
        left join public.profiles sp on sp.id = m.sender_id
        where m.conversation_id = c.id
          and (mm.cleared_at is null or m.created_at > mm.cleared_at)
          and not exists (select 1 from public.message_deletes d
                          where d.message_id = m.id and d.user_id = me_id)
        order by m.created_at desc, m.id desc
        limit 1
      ),
      'unread_count', (
        select count(*) from public.messages m
        where m.conversation_id = c.id
          and m.sender_id is distinct from me_id
          and (mm.last_read_at is null or m.created_at > mm.last_read_at)
          and (mm.cleared_at is null or m.created_at > mm.cleared_at)
          and not exists (select 1 from public.message_deletes d
                          where d.message_id = m.id and d.user_id = me_id)
      ),
      'peer', case when peer.id is null then null else jsonb_build_object(
        'id', peer.id, 'username', peer.username, 'display_name', peer.display_name,
        'avatar_url', peer.avatar_url, 'presence', peer.presence,
        'last_seen_at', case
          when peer.presence = 'invisible' then null
          when coalesce((select show_last_seen from public.user_settings
                         where user_id = peer.id), true) then peer.last_seen_at
          else null end,
        'status_text', peer.status_text, 'status_emoji', peer.status_emoji) end,
      'pinned_at', mm.pinned_at,
      'archived_at', mm.archived_at,
      'muted_until', mm.muted_until,
      'my_last_read_at', mm.last_read_at,
      'members_count', (select count(*) from public.conversation_members x
                       where x.conversation_id = c.id),
      'wallpaper', mm.wallpaper
    ) as t
    from public.conversation_members mm
    join public.conversations c on c.id = mm.conversation_id
    left join lateral (
      select p.* from public.conversation_members m2
      join public.profiles p on p.id = m2.user_id
      where m2.conversation_id = c.id and m2.user_id <> me_id
      limit 1
    ) peer on c.type = 'direct'
    where mm.user_id = me_id
      and (c.type <> 'direct' or peer.id is null
           or not public.is_blocked_between(me_id, peer.id))
  ) s;

  return result;
end;
$$;

-- ---------- grants explícitos ----------

grant select on public.communities to authenticated;
grant select on public.community_members to authenticated;
grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.my_community_role(uuid) to authenticated;
grant execute on function public.create_community(text, text) to authenticated;
grant execute on function public.get_communities() to authenticated;
grant execute on function public.get_community(uuid) to authenticated;
grant execute on function public.update_community(uuid, text, text) to authenticated;
grant execute on function public.rotate_community_invite(uuid) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.join_community_by_invite(text) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.set_community_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;
grant execute on function public.create_channel(uuid, text, boolean) to authenticated;
grant execute on function public.update_channel(uuid, text, boolean) to authenticated;
grant execute on function public.delete_channel(uuid) to authenticated;
grant execute on function public.get_channel_info(uuid) to authenticated;
grant execute on function public.explore_communities(text) to authenticated;
