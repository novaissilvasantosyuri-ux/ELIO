-- ============================================================
-- ELIO — 0006: mídia + reações + edição + encaminhar + fixar (Fase 2B)
-- Arquivos ficam no bucket privado 'chat-media' (só o servidor acessa;
-- o app baixa por URL assinada de 60s). Reações/edição via RPCs.
-- ============================================================

-- ---------- tabelas novas ----------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null, -- caminho dentro do bucket (nunca exposto ao cliente)
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 52428800),
  width int null check (width is null or (width > 0 and width <= 8000)),
  height int null check (height is null or (height > 0 and height <= 8000)),
  duration_s int null check (duration_s is null or (duration_s > 0 and duration_s <= 7200)),
  thumb_path text null,
  filename text not null default '',
  created_at timestamptz not null default now()
);
create index attachments_msg_idx on public.attachments (message_id);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index reactions_msg_idx on public.message_reactions (message_id);

-- ---------- colunas novas em messages ----------

alter table public.messages
  add column if not exists forwarded boolean not null default false,
  add column if not exists pinned_at timestamptz null,
  add column if not exists pinned_by uuid null references public.profiles (id) on delete set null;
create index if not exists messages_pinned_idx
  on public.messages (conversation_id, pinned_at desc) where pinned_at is not null;

-- vídeo como tipo próprio
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (type in ('text', 'image', 'video', 'audio', 'file', 'call', 'system'));

-- ---------- bucket privado ----------

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do update set public = false;
-- sem policies em storage.objects para 'chat-media': só a service role acessa.

-- ---------- RLS ----------

alter table public.attachments enable row level security;
alter table public.message_reactions enable row level security;

-- posso ver esta mensagem? (só membro da conversa)
create or replace function public.can_see_message(p_msg uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
    where m.id = p_msg
  );
$$;

create policy "attachments_select_member" on public.attachments
  for select to authenticated using (public.can_see_message(message_id));
create policy "reactions_select_member" on public.message_reactions
  for select to authenticated using (public.can_see_message(message_id));
-- escrita somente via RPCs/rotas validadas (nenhuma policy = negado).

-- ---------- RPC: reagir / tirar reação ----------

create or replace function public.toggle_reaction(p_msg uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  msg public.messages%rowtype;
  conv public.conversations%rowtype;
  peer_id uuid;
  clean text := btrim(coalesce(p_emoji, ''));
  reacted boolean;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if clean = '' or char_length(clean) > 16 then raise exception 'invalid_emoji'; end if;
  select * into msg from public.messages where id = p_msg;
  if not found then raise exception 'not_found'; end if;
  select * into conv from public.conversations where conversations.id = msg.conversation_id;
  if not public.is_member(msg.conversation_id) then raise exception 'forbidden'; end if;

  if conv.type = 'direct' then
    select m.user_id into peer_id from public.conversation_members m
     where m.conversation_id = msg.conversation_id and m.user_id <> me_id limit 1;
    if peer_id is not null and public.is_blocked_between(me_id, peer_id) then
      raise exception 'blocked';
    end if;
  end if;

  if exists (select 1 from public.message_reactions r
             where r.message_id = p_msg and r.user_id = me_id and r.emoji = clean) then
    delete from public.message_reactions
    where message_id = p_msg and user_id = me_id and emoji = clean;
    reacted := false;
  else
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_msg, me_id, clean);
    reacted := true;
  end if;

  return jsonb_build_object(
    'reacted', reacted,
    'counts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'emoji', r.emoji, 'count', r.c, 'mine', r.mine)
        order by r.c desc, r.emoji), '[]'::jsonb)
      from (select t.emoji, count(*) as c, bool_or(t.user_id = me_id) as mine
            from public.message_reactions t
            where t.message_id = p_msg group by t.emoji) r
    ));
end;
$$;

-- ---------- RPC: editar mensagem (só texto próprio, até 30 min) ----------

create or replace function public.edit_message(p_msg uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  msg public.messages%rowtype;
  clean text := btrim(coalesce(p_body, ''));
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if clean = '' or char_length(clean) > 4000 then raise exception 'invalid_body'; end if;
  select * into msg from public.messages where id = p_msg;
  if not found then raise exception 'not_found'; end if;
  if msg.sender_id is null or msg.sender_id <> me_id then raise exception 'forbidden'; end if;
  if msg.type <> 'text' then raise exception 'not_editable'; end if;
  if msg.created_at < now() - interval '30 minutes' then raise exception 'too_old'; end if;

  update public.messages
  set body = clean, is_edited = true, edited_at = now()
  where id = p_msg;
  return jsonb_build_object('id', p_msg, 'body', clean,
    'is_edited', true, 'edited_at', now());
end;
$$;

-- ---------- RPC: encaminhar (copia texto ou mídia; marca "encaminhada") ----------

create or replace function public.forward_message(p_msg uuid, p_conv uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  src public.messages%rowtype;
  tgt public.conversations%rowtype;
  peer_id uuid;
  new_id uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into src from public.messages where id = p_msg;
  if not found then raise exception 'not_found'; end if;
  if not public.is_member(src.conversation_id) then raise exception 'forbidden'; end if;
  if src.sender_id is null or src.type = 'system' then raise exception 'not_forwardable'; end if;

  select * into tgt from public.conversations where conversations.id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if tgt.type in ('official', 'system') then raise exception 'read_only'; end if;
  if not public.is_member(p_conv) then raise exception 'forbidden'; end if;
  if tgt.type = 'direct' then
    select m.user_id into peer_id from public.conversation_members m
     where m.conversation_id = p_conv and m.user_id <> me_id limit 1;
    if peer_id is not null then
      if public.is_blocked_between(me_id, peer_id) then raise exception 'blocked'; end if;
      if not public.target_allows_messages(peer_id, me_id) then raise exception 'not_allowed'; end if;
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, client_id, type, body, forwarded)
  values (p_conv, me_id, gen_random_uuid(), src.type, src.body, true)
  returning id into new_id;
  -- mídia: reaproveita o arquivo (sem copiar bytes; o acesso segue por URL assinada)
  insert into public.attachments
    (message_id, storage_path, mime, size_bytes, width, height, duration_s, thumb_path, filename)
  select new_id, a.storage_path, a.mime, a.size_bytes, a.width, a.height, a.duration_s, a.thumb_path, a.filename
  from public.attachments a where a.message_id = p_msg;

  return jsonb_build_object('id', new_id);
end;
$$;

-- ---------- RPC: fixar / desafixar (qualquer membro) ----------

create or replace function public.pin_message(p_msg uuid, p_pin boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  msg public.messages%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into msg from public.messages where id = p_msg;
  if not found then raise exception 'not_found'; end if;
  if not public.is_member(msg.conversation_id) then raise exception 'forbidden'; end if;
  if msg.sender_id is null then raise exception 'not_pinnable'; end if;

  if coalesce(p_pin, false) then
    update public.messages set pinned_at = now(), pinned_by = me_id where id = p_msg;
  else
    update public.messages set pinned_at = null, pinned_by = null where id = p_msg;
  end if;
  return jsonb_build_object('pinned', coalesce(p_pin, false));
end;
$$;

-- ---------- RPC: lista de fixadas ----------

create or replace function public.get_pinned(p_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  mem public.conversation_members%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into mem from public.conversation_members
   where conversation_id = p_conv and user_id = me_id;
  if not found then raise exception 'forbidden'; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'type', m.type, 'body', left(m.body, 160),
      'sender_id', m.sender_id,
      'sender_name', case when m.sender_id = me_id then 'Você'
                          else coalesce(sp.display_name, '') end,
      'created_at', m.created_at, 'pinned_at', m.pinned_at)
      order by m.pinned_at desc), '[]'::jsonb)
    from public.messages m
    left join public.profiles sp on sp.id = m.sender_id
    where m.conversation_id = p_conv
      and m.pinned_at is not null
      and (mem.cleared_at is null or m.created_at > mem.cleared_at)
      and not exists (select 1 from public.message_deletes d
                      where d.message_id = m.id and d.user_id = me_id)
  );
end;
$$;

-- ---------- histórico: agora traz reações + anexos + flags ----------

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
        and (p_before_at is null or p_before_id is null
             or (m.created_at, m.id) < (p_before_at, p_before_id))
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 50)
    ) s
  );
end;
$$;

-- ---------- RPC: enviar mídia (valida tudo + cria mensagem e anexo) ----------

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

  -- idempotência: reenvio devolve a original
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

-- ---------- realtime: reações ao vivo ----------

alter publication supabase_realtime add table public.message_reactions;
alter table public.message_reactions replica identity full;

-- ---------- grants explícitos ----------

grant select on public.attachments to authenticated;
grant select on public.message_reactions to authenticated;
grant execute on function public.can_see_message(uuid) to authenticated;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.forward_message(uuid, uuid) to authenticated;
grant execute on function public.pin_message(uuid, boolean) to authenticated;
grant execute on function public.get_pinned(uuid) to authenticated;
grant execute on function public.send_media(uuid, uuid, text, text, uuid, text, text, int, text, int, int, int) to authenticated;
