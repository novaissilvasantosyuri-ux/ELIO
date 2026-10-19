-- ============================================================
-- ELIO — 0002: funções auxiliares + RPCs (Fase 1)
-- RPCs usam SECURITY DEFINER com checagens internas explícitas.
-- ============================================================

-- ---------- auxiliares ----------

create or replace function public.is_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = auth.uid()
  );
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- O alvo aceita mensagem minha? (privacy messages_from)
create or replace function public.target_allows_messages(target_id uuid, me_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select messages_from from public.user_settings where user_id = target_id), 'everyone')
    when 'everyone' then true
    when 'nobody' then false
    else exists (select 1 from public.contacts where user_id = target_id and contact_id = me_id)
  end;
$$;

-- O alvo aceita solicitação de contato minha? (privacy addable_by)
create or replace function public.target_allows_add(target_id uuid, me_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select addable_by from public.user_settings where user_id = target_id), 'everyone')
    when 'everyone' then true
    when 'nobody' then false
    else exists (select 1 from public.contacts where user_id = target_id and contact_id = me_id)
  end;
$$;

create or replace function public.handle_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Limite de requisições: incrementa atômico e devolve a contagem.
create or replace function public.rate_limit_hit(p_key text, p_window timestamptz)
returns int language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into c;
  return c;
end;
$$;

-- ---------- RPC: listar conversas ----------

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
                              else coalesce(peer.display_name, '') end,
          'created_at', m.created_at)
        from public.messages m
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
        -- "visto por último" filtrado no servidor (privacidade da outra pessoa)
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

-- ---------- RPC: histórico paginado ----------

create or replace function public.get_messages(
  p_conv uuid,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 30
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  mem public.conversation_members%rowtype;
  peer_id uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into mem from public.conversation_members
   where conversation_id = p_conv and user_id = me_id;
  if not found then raise exception 'forbidden'; end if;
  select m2.user_id into peer_id from public.conversation_members m2
   where m2.conversation_id = p_conv and m2.user_id <> me_id limit 1;

  return (
    select coalesce(jsonb_agg(s.obj), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', m.id,
        'conversation_id', m.conversation_id,
        'sender_id', m.sender_id,
        'client_id', m.client_id,
        'type', m.type,
        'body', m.body,
        'reply_to_id', m.reply_to_id,
        'reply_preview', case when rm.id is null then null else jsonb_build_object(
          'id', rm.id, 'body', left(rm.body, 160),
          'sender_name', case when rm.sender_id is null then 'Equipe ELIO'
                              when rm.sender_id = me_id then 'Você'
                              else coalesce(sp2.display_name, '') end,
          'sender_id', rm.sender_id) end,
        'is_edited', m.is_edited,
        'edited_at', m.edited_at,
        'created_at', m.created_at,
        'sender_name', case when m.sender_id is null then 'Equipe ELIO'
                            when m.sender_id = me_id then 'Você'
                            else coalesce(sp.display_name, '') end,
        'sender_avatar', case when m.sender_id is null or m.sender_id = me_id
                              then null else sp.avatar_url end,
        'delivered_at', r.delivered_at,
        'read_at', r.read_at
      ) as obj
      from public.messages m
      left join public.profiles sp on sp.id = m.sender_id
      left join public.messages rm on rm.id = m.reply_to_id
      left join public.profiles sp2 on sp2.id = rm.sender_id
      left join public.receipts r on r.message_id = m.id
        and r.user_id = case when m.sender_id = me_id then peer_id else me_id end
      where m.conversation_id = p_conv
        and (mem.cleared_at is null or m.created_at > mem.cleared_at)
        and not exists (select 1 from public.message_deletes d
                        where d.message_id = m.id and d.user_id = me_id)
        and (p_before_at is null or p_before_id is null
             or (m.created_at, m.id) < (p_before_at, p_before_id))
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 50)
    ) s
  );
end;
$$;

-- ---------- RPC: enviar mensagem (idempotente) ----------

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

-- ---------- RPC: recibos (entregue/lido) ----------

create or replace function public.set_receipts(
  p_conv uuid,
  p_delivered uuid[] default '{}',
  p_read uuid[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  can_read boolean := true;
  d int := 0;
  r int := 0;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = p_conv and user_id = me_id) then
    raise exception 'forbidden';
  end if;
  select coalesce((select read_receipts from public.user_settings where user_id = me_id), true)
    into can_read;

  with ins as (
    insert into public.receipts (message_id, user_id, delivered_at)
    select m.id, me_id, now()
    from public.messages m
    where m.id = any (p_delivered)
      and m.conversation_id = p_conv
      and m.sender_id is distinct from me_id
    on conflict (message_id, user_id)
    do update set delivered_at = coalesce(public.receipts.delivered_at, excluded.delivered_at)
    returning 1
  ) select count(*) into d from ins;

  if can_read then
    with ins as (
      insert into public.receipts (message_id, user_id, delivered_at, read_at)
      select m.id, me_id, now(), now()
      from public.messages m
      where m.id = any (p_read)
        and m.conversation_id = p_conv
        and m.sender_id is distinct from me_id
      on conflict (message_id, user_id)
      do update set delivered_at = coalesce(public.receipts.delivered_at, now()),
                     read_at = now()
      returning 1
    ) select count(*) into r from ins;

    update public.conversation_members
       set last_read_at = now(),
           last_read_message_id = (
             select m.id from public.messages m
             where m.id = any (p_read) and m.conversation_id = p_conv
             order by m.created_at desc limit 1
           )
     where conversation_id = p_conv and user_id = me_id;
  end if;

  return jsonb_build_object('delivered', d, 'read', r);
end;
$$;

-- ---------- RPC: buscar por @usuário ----------

create or replace function public.find_by_username(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  clean text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  row public.profiles%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into row from public.profiles p where p.username = clean::citext;
  if not found then return null; end if;
  if row.id = me_id then return null; end if;
  if public.is_blocked_between(me_id, row.id) then return null; end if;
  if not coalesce((select findable_by_username from public.user_settings
                   where user_id = row.id), true) then return null; end if;
  return jsonb_build_object(
    'id', row.id, 'username', row.username, 'display_name', row.display_name,
    'avatar_url', row.avatar_url, 'bio', row.bio);
end;
$$;

-- ---------- RPC: criar (ou abrir) conversa direta ----------

create or replace function public.create_dm(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  clean text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  target public.profiles%rowtype;
  existing uuid;
  new_id uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into target from public.profiles p where p.username = clean::citext;
  if not found then raise exception 'not_found'; end if;
  if target.id = me_id then raise exception 'self'; end if;
  if public.is_blocked_between(me_id, target.id) then raise exception 'blocked'; end if;
  if not public.target_allows_messages(target.id, me_id) then raise exception 'not_allowed'; end if;

  select c.id into existing
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = me_id
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = target.id
  where c.type = 'direct' limit 1;
  if found then return jsonb_build_object('id', existing, 'created', false); end if;

  insert into public.conversations (type, created_by)
  values ('direct', me_id) returning id into new_id;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (new_id, me_id, 'member'), (new_id, target.id, 'member');
  return jsonb_build_object('id', new_id, 'created', true);
end;
$$;

-- ---------- RPC: solicitar contato ----------

create or replace function public.create_contact_request(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  clean text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  target public.profiles%rowtype;
  req_id uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into target from public.profiles p where p.username = clean::citext;
  if not found then raise exception 'not_found'; end if;
  if target.id = me_id then raise exception 'self'; end if;
  if public.is_blocked_between(me_id, target.id) then raise exception 'blocked'; end if;
  if exists (select 1 from public.contacts
             where user_id = me_id and contact_id = target.id) then
    raise exception 'already';
  end if;
  if exists (select 1 from public.contact_requests
             where status = 'pending'
               and ((from_id = me_id and to_id = target.id)
                 or (from_id = target.id and to_id = me_id))) then
    raise exception 'pending';
  end if;
  if not public.target_allows_add(target.id, me_id) then raise exception 'not_allowed'; end if;

  insert into public.contact_requests (from_id, to_id)
  values (me_id, target.id) returning id into req_id;
  return jsonb_build_object('id', req_id);
end;
$$;

-- ---------- RPC: presença filtrada (privacidade no servidor) ----------

create or replace function public.get_presence(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'presence', p.presence,
      'last_seen_at', case
        when p.presence = 'invisible' then null
        when coalesce((select show_last_seen from public.user_settings
                       where user_id = p.id), true) then p.last_seen_at
        else null end
    )), '[]'::jsonb)
    from public.profiles p
    where p.id = any (p_ids)
      and not public.is_blocked_between(me_id, p.id)
      and (
        p.id = me_id
        or exists (
          select 1 from public.conversation_members m1
          join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
          join public.conversations c on c.id = m1.conversation_id
          where m1.user_id = me_id and m2.user_id = p.id
            and c.type in ('direct', 'group', 'channel')
        )
        or exists (select 1 from public.contacts
                   where user_id = me_id and contact_id = p.id)
      )
  );
end;
$$;

-- ---------- RPC: listas sociais (contatos, solicitações, bloqueados) ----------

create or replace function public.get_contacts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'presence', p.presence,
      'last_seen_at', case
        when p.presence = 'invisible' then null
        when coalesce((select show_last_seen from public.user_settings
                       where user_id = p.id), true) then p.last_seen_at
        else null end,
      'status_text', p.status_text, 'status_emoji', p.status_emoji
    ) order by p.display_name), '[]'::jsonb)
    from public.contacts c
    join public.profiles p on p.id = c.contact_id
    where c.user_id = me_id
      and not public.is_blocked_between(me_id, p.id)
  );
end;
$$;

create or replace function public.get_contact_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'from_id', r.from_id, 'to_id', r.to_id,
      'status', r.status, 'created_at', r.created_at,
      'other', jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'display_name', p.display_name,
        'avatar_url', p.avatar_url, 'presence', p.presence,
        'last_seen_at', null, 'status_text', p.status_text, 'status_emoji', p.status_emoji)
    ) order by r.created_at desc), '[]'::jsonb)
    from public.contact_requests r
    join public.profiles p
      on p.id = case when r.from_id = me_id then r.to_id else r.from_id end
    where (r.from_id = me_id or r.to_id = me_id)
      and r.status = 'pending'
      and not public.is_blocked_between(me_id, p.id)
  );
end;
$$;

create or replace function public.get_blocked()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'presence', 'offline',
      'last_seen_at', null, 'status_text', '', 'status_emoji', ''
    ) order by p.display_name), '[]'::jsonb)
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = me_id
  );
end;
$$;

-- ---------- RPC: disponibilidade de @ (pública, só livre/ocupado) ----------

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where username = lower(regexp_replace(btrim(p_username), '^@+', ''))::citext
  );
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- RPC: trocar @usuário (com limite) ----------

create or replace function public.change_username(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  clean text := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
  cur citext;
  cnt int;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if clean !~ '^[a-z0-9._]{3,20}$' then raise exception 'invalid_username'; end if;
  select username into cur from public.profiles where id = me_id;
  if cur = clean::citext then
    return jsonb_build_object('username', cur, 'changed', false);
  end if;
  select count(*) into cnt from public.username_changes
   where user_id = me_id and changed_at > now() - interval '30 days';
  if cnt >= 3 then raise exception 'limit_reached'; end if;
  if exists (select 1 from public.profiles where username = clean::citext) then
    raise exception 'taken';
  end if;
  update public.profiles set username = clean::citext, updated_at = now() where id = me_id;
  insert into public.username_changes (user_id, old_username, new_username)
  values (me_id, cur, clean::citext);
  return jsonb_build_object('username', clean, 'changed', true);
end;
$$;
