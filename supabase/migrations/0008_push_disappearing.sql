-- Fase 4: notificações push (inscrições) + mensagens que somem (timer por conversa).
-- Timer: 0 = desligado, 86400 = 24h, 604800 = 7 dias. Mensagens de sistema não somem.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 1 and 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 500),
  auth text not null check (char_length(auth) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index push_user_idx on public.push_subscriptions (user_id);

alter table public.conversations
  add column if not exists disappear_after int not null default 0
  check (disappear_after in (0, 86400, 604800));

-- ---------- RLS ----------

alter table public.push_subscriptions enable row level security;
drop policy if exists "push own read" on public.push_subscriptions;
create policy "push own read" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
-- escrita só pelos RPCs (definer).

-- ---------- RPC: salvar inscrição push (minha) ----------

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_endpoint is null or btrim(p_endpoint) = '' then raise exception 'invalid_body'; end if;
  if p_p256dh is null or btrim(p_p256dh) = '' then raise exception 'invalid_body'; end if;
  if p_auth is null or btrim(p_auth) = '' then raise exception 'invalid_body'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (me_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth))
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('saved', true);
end;
$$;

-- ---------- RPC: remover inscrição push (minha) ----------

create or replace function public.delete_push_subscription(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  gone int;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  delete from public.push_subscriptions
  where user_id = me_id and endpoint = btrim(coalesce(p_endpoint, ''));
  get diagnostics gone = row_count;
  return jsonb_build_object('deleted', gone > 0);
end;
$$;

-- ---------- RPC: alvos de push da conversa (membro chama; menos eu e silenciados) ----------

create or replace function public.get_push_targets(p_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = p_conv and user_id = me_id) then
    raise exception 'forbidden';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'endpoint', s.endpoint,
      'p256dh', s.p256dh, 'auth', s.auth,
      'preview_text', coalesce((select preview_text from public.user_settings
                                where user_id = s.user_id), true)
    )), '[]'::jsonb)
    from public.push_subscriptions s
    join public.conversation_members m
      on m.conversation_id = p_conv and m.user_id = s.user_id
    where s.user_id <> me_id
      and (m.muted_until is null or m.muted_until <= now())
  );
end;
$$;

-- ---------- RPC: timer de mensagens que somem ----------

create or replace function public.set_disappearing(p_conv uuid, p_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  my_role text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_seconds is null or p_seconds not in (0, 86400, 604800) then raise exception 'bad_timer'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if conv.type in ('official', 'system') then raise exception 'read_only'; end if;
  select role into my_role from public.conversation_members
  where conversation_id = p_conv and user_id = me_id;
  if my_role is null then raise exception 'forbidden'; end if;

  if conv.type = 'group' and my_role not in ('owner', 'admin') then
    raise exception 'needs_admin';
  end if;
  if conv.type = 'channel' then
    select public.my_community_role(conv.community_id) into my_role;
    if my_role is distinct from 'owner' and my_role is distinct from 'admin' then
      raise exception 'needs_admin';
    end if;
  end if;

  update public.conversations set disappear_after = p_seconds, updated_at = now()
  where id = p_conv;
  perform public.sys_msg(p_conv, case p_seconds
    when 86400 then '⏳ Novas mensagens somem após 24 horas.'
    when 604800 then '⏳ Novas mensagens somem após 7 dias.'
    else '⏳ Timer desligado: novas mensagens não somem mais.' end);
  return jsonb_build_object('disappear_after', p_seconds);
end;
$$;

-- ---------- RPC: expurgo (SOMENTE service role via revoke abaixo) ----------

create or replace function public.purge_expired_messages()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  paths text[];
  gone int;
begin
  select coalesce(array_agg(a.storage_path), '{}') into paths
  from public.attachments a
  join public.messages m on m.id = a.message_id
  join public.conversations c on c.id = m.conversation_id
  where c.disappear_after > 0 and m.sender_id is not null
    and m.created_at + make_interval(secs => c.disappear_after) <= now();
  delete from public.messages m
  using public.conversations c
  where m.conversation_id = c.id
    and c.disappear_after > 0 and m.sender_id is not null
    and m.created_at + make_interval(secs => c.disappear_after) <= now();
  get diagnostics gone = row_count;
  return jsonb_build_object('deleted', gone, 'paths', to_jsonb(paths));
end;
$$;

-- ---------- histórico: esconde expiradas (sistema nunca expira) ----------

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
  timer int := 0;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into mem from public.conversation_members
   where conversation_id = p_conv and user_id = me_id;
  if not found then raise exception 'forbidden'; end if;
  select m2.user_id into peer_id from public.conversation_members m2
   where m2.conversation_id = p_conv and m2.user_id <> me_id limit 1;
  select coalesce(disappear_after, 0) into timer
  from public.conversations where id = p_conv;

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
        'read_at', r.read_at,
        'forwarded', m.forwarded,
        'pinned_at', m.pinned_at,
        'pinned_by', m.pinned_by,
        'reactions', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'emoji', t.emoji, 'count', t.c, 'mine', t.mine)
            order by t.c desc, t.emoji), '[]'::jsonb)
          from (select rr.emoji, count(*) as c, bool_or(rr.user_id = me_id) as mine
                from public.message_reactions rr
                where rr.message_id = m.id group by rr.emoji) t
        ),
        'attachments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'mime', a.mime, 'size_bytes', a.size_bytes,
            'width', a.width, 'height', a.height, 'duration_s', a.duration_s, 'filename', a.filename)
            order by a.created_at), '[]'::jsonb)
          from public.attachments a where a.message_id = m.id
        )
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
        and (timer = 0 or m.sender_id is null
             or m.created_at + make_interval(secs => timer) > now())
        and (p_before_at is null or p_before_id is null
             or (m.created_at, m.id) < (p_before_at, p_before_id))
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 50)
    ) s
  );
end;
$$;

-- ---------- lista de conversas: + disappear_after, prévia/não-lidas ignoram expiradas ----------

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
      'disappear_after', c.disappear_after,
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
          and (c.disappear_after = 0 or m.sender_id is null
               or m.created_at + make_interval(secs => c.disappear_after) > now())
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
          and (c.disappear_after = 0 or m.sender_id is null
               or m.created_at + make_interval(secs => c.disappear_after) > now())
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

grant select on public.push_subscriptions to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.get_push_targets(uuid) to authenticated;
grant execute on function public.set_disappearing(uuid, int) to authenticated;
-- expurgo: NUNCA pelo cliente (só service role na rota /api/cron/purge).
revoke all on function public.purge_expired_messages() from public, anon, authenticated;
