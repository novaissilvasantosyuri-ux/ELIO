-- ============================================================
-- ELIO — 0005: grupos (Fase 2A)
-- Gestão de grupos via RPCs (SECURITY DEFINER com checagens internas).
-- Papéis: 'owner' (dono) > 'admin' > 'member'. Só o dono mexe em papéis.
-- ============================================================

-- ---------- colunas novas ----------

alter table public.conversations
  add column if not exists description text not null default '',
  add column if not exists invite_code text null;

alter table public.conversations
  add constraint conversations_title_len check (char_length(title) <= 60);

alter table public.conversations
  add constraint conversations_desc_len check (char_length(description) <= 300);

-- código de convite único (nulo = sem convite / revogado)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_invite_unique') then
    alter table public.conversations add constraint conversations_invite_unique unique (invite_code);
  end if;
end $$;

-- ---------- auxiliares ----------

-- meu papel na conversa (null = não sou membro)
create or replace function public.my_role(p_conv uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.conversation_members
  where conversation_id = p_conv and user_id = auth.uid();
$$;

-- código aleatório de 12 letras/números para convite
create or replace function public.gen_invite_code()
returns text language sql security definer set search_path = public as $$
  -- 12 chars a partir de 128 bits aleatórios (sem extensões extras)
  select left(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''),
    'hex'), 'base64'), '+/=', 'xQz'), 12);
$$;

-- mensagem de sistema (entra no histórico de todos, ex.: "Ana saiu do grupo")
create or replace function public.sys_msg(p_conv uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (conversation_id, sender_id, type, body)
  values (p_conv, null, 'system', left(btrim(p_text), 400));
end;
$$;

-- ---------- RPC: criar grupo ----------

create or replace function public.create_group(p_title text, p_member_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  title text := btrim(coalesce(p_title, ''));
  ids uuid[];
  new_id uuid;
  one uuid;
  target public.profiles%rowtype;
  my_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if title = '' or char_length(title) > 60 then raise exception 'invalid_title'; end if;

  select coalesce(array_agg(distinct x), '{}') into ids
  from unnest(coalesce(p_member_ids, '{}')) x where x is not null and x <> me_id;
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'needs_members'; end if;
  if array_length(ids, 1) > 100 then raise exception 'too_many'; end if;

  foreach one in array ids loop
    select * into target from public.profiles p where p.id = one;
    if not found then raise exception 'not_found'; end if;
    if public.is_blocked_between(me_id, target.id) then raise exception 'blocked'; end if;
    if not public.target_allows_add(target.id, me_id) then raise exception 'not_allowed'; end if;
  end loop;

  insert into public.conversations (type, title, created_by)
  values ('group', title, me_id) returning id into new_id;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (new_id, me_id, 'owner');
  insert into public.conversation_members (conversation_id, user_id, role)
  select new_id, x, 'member' from unnest(ids) x;

  select display_name into my_name from public.profiles where id = me_id;
  perform public.sys_msg(new_id, coalesce(my_name, 'Alguém') || ' criou o grupo');
  return jsonb_build_object('id', new_id);
end;
$$;

-- ---------- RPC: dados do grupo + membros ----------

create or replace function public.get_group_members(p_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is null then raise exception 'forbidden'; end if;

  return jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conv.id, 'title', conv.title, 'description', conv.description,
      'avatar_url', conv.avatar_url, 'invite_code', conv.invite_code,
      'members_count', (select count(*) from public.conversation_members m
                       where m.conversation_id = p_conv)),
    'my_role', role,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'presence', p.presence,
        'role', m.role, 'joined_at', m.joined_at)
        order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
                 p.display_name)
      from public.conversation_members m
      join public.profiles p on p.id = m.user_id
      where m.conversation_id = p_conv
        and not public.is_blocked_between(me_id, m.user_id)
    ), '[]'::jsonb));
end;
$$;

-- ---------- RPC: adicionar membros (admin+) ----------

create or replace function public.add_group_members(p_conv uuid, p_member_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  ids uuid[];
  one uuid;
  target public.profiles%rowtype;
  added int := 0;
  skipped text[] := '{}';
  my_name text;
  names text[] := '{}';
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where conversations.id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is distinct from 'owner' and role is distinct from 'admin' then raise exception 'needs_admin'; end if;

  select coalesce(array_agg(distinct x), '{}') into ids
  from unnest(coalesce(p_member_ids, '{}')) x where x is not null and x <> me_id;
  if (select count(*) from public.conversation_members m
      where m.conversation_id = p_conv) + coalesce(array_length(ids, 1), 0) > 200 then
    raise exception 'full';
  end if;

  foreach one in array ids loop
    select * into target from public.profiles where profiles.id = one;
    if not found then skipped := skipped || 'alguém'; continue; end if;
    if exists (select 1 from public.conversation_members m
               where m.conversation_id = p_conv and m.user_id = one) then continue; end if;
    if public.is_blocked_between(me_id, one)
       or not public.target_allows_add(one, me_id) then
      skipped := skipped || target.username::text; continue;
    end if;
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_conv, one, 'member');
    added := added + 1;
    names := names || target.display_name;
  end loop;

  if added > 0 then
    select display_name into my_name from public.profiles where id = me_id;
    perform public.sys_msg(p_conv, coalesce(my_name, 'Alguém') || ' adicionou ' ||
      array_to_string(names[1:3], ', ') ||
      case when added > 3 then ' e outras ' || (added - 3) || ' pessoas' else '' end);
  end if;
  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;

-- ---------- RPC: remover membro (admin+) ----------

create or replace function public.remove_group_member(p_conv uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  target_role text;
  target_name text;
  my_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is distinct from 'owner' and role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  if p_user = me_id then raise exception 'use_leave'; end if;
  select m.role into target_role from public.conversation_members m
  where m.conversation_id = p_conv and m.user_id = p_user;
  if target_role is null then raise exception 'not_member'; end if;
  if target_role = 'owner' then raise exception 'cannot_remove_owner'; end if;

  delete from public.conversation_members
  where conversation_id = p_conv and user_id = p_user;
  select display_name into target_name from public.profiles where id = p_user;
  select display_name into my_name from public.profiles where id = me_id;
  perform public.sys_msg(p_conv, coalesce(my_name, 'Alguém') || ' removeu ' ||
    coalesce(target_name, 'alguém'));
  return jsonb_build_object('removed', true);
end;
$$;

-- ---------- RPC: papéis (só o dono) ----------

create or replace function public.set_member_role(p_conv uuid, p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  target_role text;
  target_name text;
  my_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_role not in ('owner', 'admin', 'member') then raise exception 'bad_role'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is distinct from 'owner' then raise exception 'needs_owner'; end if;
  if p_user = me_id then raise exception 'self'; end if;
  select m.role into target_role from public.conversation_members m
  where m.conversation_id = p_conv and m.user_id = p_user;
  if target_role is null then raise exception 'not_member'; end if;

  select display_name into target_name from public.profiles where id = p_user;
  select display_name into my_name from public.profiles where id = me_id;
  if p_role = 'owner' then
    -- transfere a posse: o dono atual vira admin
    update public.conversation_members set role = 'admin'
    where conversation_id = p_conv and user_id = me_id;
    update public.conversation_members set role = 'owner'
    where conversation_id = p_conv and user_id = p_user;
    perform public.sys_msg(p_conv, coalesce(target_name, 'Alguém') || ' agora é dono do grupo');
  else
    update public.conversation_members set role = p_role
    where conversation_id = p_conv and user_id = p_user;
    perform public.sys_msg(p_conv, coalesce(target_name, 'Alguém') ||
      case when p_role = 'admin' then ' agora é administrador' else ' não é mais administrador' end);
  end if;
  return jsonb_build_object('role', p_role);
end;
$$;

-- ---------- RPC: sair do grupo ----------

create or replace function public.leave_group(p_conv uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  my_name text;
  next_owner uuid;
  next_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is null then raise exception 'not_member'; end if;

  select display_name into my_name from public.profiles where id = me_id;
  if (select count(*) from public.conversation_members m
      where m.conversation_id = p_conv) = 1 then
    -- último a sair: o grupo deixa de existir
    delete from public.conversations where id = p_conv;
    return jsonb_build_object('deleted', true);
  end if;

  delete from public.conversation_members
  where conversation_id = p_conv and user_id = me_id;
  perform public.sys_msg(p_conv, coalesce(my_name, 'Alguém') || ' saiu do grupo');

  if role = 'owner' then
    -- posse passa para o membro mais antigo
    select m.user_id into next_owner from public.conversation_members m
    where m.conversation_id = p_conv order by m.joined_at, m.user_id limit 1;
    update public.conversation_members set role = 'owner'
    where conversation_id = p_conv and user_id = next_owner;
    select display_name into next_name from public.profiles where id = next_owner;
    perform public.sys_msg(p_conv, coalesce(next_name, 'Alguém') || ' agora é dono do grupo');
  end if;
  return jsonb_build_object('deleted', false);
end;
$$;

-- ---------- RPC: editar nome/descrição (admin+) ----------

create or replace function public.update_group(p_conv uuid, p_title text default null,
  p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  v_title text;
  descr text;
  my_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is distinct from 'owner' and role is distinct from 'admin' then raise exception 'needs_admin'; end if;

  select display_name into my_name from public.profiles where id = me_id;
  if p_title is not null then
    v_title := btrim(p_title);
    if v_title = '' or char_length(v_title) > 60 then raise exception 'invalid_title'; end if;
    update public.conversations set title = v_title, updated_at = now() where id = p_conv;
    perform public.sys_msg(p_conv, coalesce(my_name, 'Alguém') || ' mudou o nome do grupo');
  end if;
  if p_description is not null then
    descr := btrim(p_description);
    if char_length(descr) > 300 then raise exception 'invalid_description'; end if;
    update public.conversations set description = descr, updated_at = now() where id = p_conv;
  end if;
  return jsonb_build_object('updated', true);
end;
$$;

-- ---------- RPC: gerar novo código de convite (admin+) ----------

create or replace function public.rotate_invite(p_conv uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  role text;
  code text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found or conv.type <> 'group' then raise exception 'not_group'; end if;
  select public.my_role(p_conv) into role;
  if role is distinct from 'owner' and role is distinct from 'admin' then raise exception 'needs_admin'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.conversations c where c.invite_code = code);
  end loop;
  update public.conversations set invite_code = code, updated_at = now() where id = p_conv;
  return jsonb_build_object('code', code);
end;
$$;

-- ---------- RPC: entrar pelo convite ----------

create or replace function public.join_by_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  code text := btrim(coalesce(p_code, ''));
  conv public.conversations%rowtype;
  my_name text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into conv from public.conversations
  where invite_code = code and type = 'group';
  if not found then raise exception 'bad_code'; end if;
  if exists (select 1 from public.conversation_members m
             where m.conversation_id = conv.id and m.user_id = me_id) then
    return jsonb_build_object('id', conv.id, 'joined', false);
  end if;
  if (select count(*) from public.conversation_members m
      where m.conversation_id = conv.id) >= 200 then
    raise exception 'full';
  end if;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (conv.id, me_id, 'member');
  select display_name into my_name from public.profiles where id = me_id;
  perform public.sys_msg(conv.id, coalesce(my_name, 'Alguém') || ' entrou pelo link de convite');
  return jsonb_build_object('id', conv.id, 'joined', true);
end;
$$;

-- ---------- lista de conversas: nome do remetente em grupos ----------
-- (antes mostrava vazio, pois só buscava o nome no par da DM)

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

-- ---------- grants explícitos (novas funções) ----------

grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.gen_invite_code() to authenticated;
grant execute on function public.sys_msg(uuid, text) to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.get_group_members(uuid) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.update_group(uuid, text, text) to authenticated;
grant execute on function public.rotate_invite(uuid) to authenticated;
grant execute on function public.join_by_invite(text) to authenticated;
