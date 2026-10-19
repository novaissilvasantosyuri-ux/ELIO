-- Fase 5: Elio IA — conversa solo tipo 'ai' + flag is_ai nas respostas.
-- A IA responde pela rota /api/ia (Gemini); o limite diário é aplicado na rota.

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'conversations_type_check') then
    alter table public.conversations drop constraint conversations_type_check;
  end if;
end $$;
alter table public.conversations
  add constraint conversations_type_check
  check (type in ('direct', 'group', 'channel', 'official', 'system', 'ai'));

alter table public.messages
  add column if not exists is_ai boolean not null default false;

-- ---------- RPC: meu chat com a Elio IA (cria se não existe) ----------

create or replace function public.get_or_create_ai_chat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  cid uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select m.conversation_id into cid
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  where m.user_id = me_id and c.type = 'ai'
  limit 1;
  if cid is null then
    insert into public.conversations (type, title, created_by)
    values ('ai', 'Elio IA', me_id) returning id into cid;
    insert into public.conversation_members (conversation_id, user_id, role)
    values (cid, me_id, 'member');
    insert into public.messages (conversation_id, sender_id, type, body, is_ai)
    values (cid, null, 'text',
      'Oi! Eu sou a Elio IA 🤖 Posso ajudar a escrever, resumir e organizar ideias. O que vamos fazer hoje?', true);
    update public.conversations set last_message_at = now() where id = cid;
  end if;
  return jsonb_build_object('id', cid);
end;
$$;

-- ---------- RPC: resposta da IA (só no próprio chat 'ai') ----------

create or replace function public.ai_reply(p_conv uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  new_row public.messages%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if v_body = '' or char_length(v_body) > 4000 then raise exception 'invalid_body'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if conv.type <> 'ai' then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = p_conv and user_id = me_id) then
    raise exception 'forbidden';
  end if;
  insert into public.messages (conversation_id, sender_id, client_id, type, body, is_ai)
  values (p_conv, null, gen_random_uuid(), 'text', v_body, true)
  returning * into new_row;
  update public.conversations set last_message_at = new_row.created_at, updated_at = now()
  where id = p_conv;
  return jsonb_build_object('message', to_jsonb(new_row));
end;
$$;

-- ---------- histórico: + is_ai, nome "Elio IA" ----------

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
        'is_ai', m.is_ai,
        'reply_to_id', m.reply_to_id,
        'reply_preview', case when rm.id is null then null else jsonb_build_object(
          'id', rm.id, 'body', left(rm.body, 160),
          'sender_name', case when rm.is_ai then 'Elio IA'
                              when rm.sender_id is null then 'Equipe ELIO'
                              when rm.sender_id = me_id then 'Você'
                              else coalesce(sp2.display_name, '') end,
          'sender_id', rm.sender_id) end,
        'is_edited', m.is_edited,
        'edited_at', m.edited_at,
        'created_at', m.created_at,
        'sender_name', case when m.is_ai then 'Elio IA'
                            when m.sender_id is null then 'Equipe ELIO'
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

-- ---------- grants explícitos ----------

grant execute on function public.get_or_create_ai_chat() to authenticated;
grant execute on function public.ai_reply(uuid, text) to authenticated;
