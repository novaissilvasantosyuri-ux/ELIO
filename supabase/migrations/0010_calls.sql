-- Fase 6: chamadas de voz/vídeo 1-a-1 (WebRTC; sinalização via Realtime broadcast).
-- O servidor valida e guarda estado; áudio/vídeo vão direto entre aparelhos (P2P).

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  ended_at timestamptz null,
  constraint no_self_call check (caller_id <> callee_id)
);
create index calls_conv_idx on public.calls (conversation_id, created_at desc);

alter table public.calls enable row level security;
drop policy if exists "calls party read" on public.calls;
create policy "calls party read" on public.calls
  for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);
-- escrita só pelos RPCs (definer).

-- ---------- RPC: iniciar chamada (DM, sem bloqueio, sem outra ativa) ----------

create or replace function public.start_call(p_conv uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  conv public.conversations%rowtype;
  peer_id uuid;
  cid uuid;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_kind is null or p_kind not in ('voice', 'video') then raise exception 'invalid_body'; end if;
  select * into conv from public.conversations where id = p_conv;
  if not found then raise exception 'not_found'; end if;
  if conv.type <> 'direct' then raise exception 'not_direct'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = p_conv and user_id = me_id) then
    raise exception 'forbidden';
  end if;
  select m.user_id into peer_id from public.conversation_members m
  where m.conversation_id = p_conv and m.user_id <> me_id limit 1;
  if peer_id is null then raise exception 'not_found'; end if;
  if public.is_blocked_between(me_id, peer_id) then raise exception 'blocked'; end if;

  -- aposenta chamadas presas em 'ringing' há mais de 2 minutos
  update public.calls set status = 'missed', ended_at = now()
  where conversation_id = p_conv and status = 'ringing'
    and created_at < now() - interval '2 minutes';

  if exists (select 1 from public.calls
             where conversation_id = p_conv and status in ('ringing', 'accepted')) then
    raise exception 'busy';
  end if;

  insert into public.calls (conversation_id, caller_id, callee_id, kind)
  values (p_conv, me_id, peer_id, p_kind) returning id into cid;
  return jsonb_build_object('id', cid, 'callee_id', peer_id);
end;
$$;

-- ---------- RPC: atender (só quem recebe, em até 90s) ----------

create or replace function public.accept_call(p_call uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  c public.calls%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into c from public.calls where id = p_call;
  if not found then raise exception 'not_found'; end if;
  if me_id <> c.callee_id then raise exception 'forbidden'; end if;
  if c.status <> 'ringing' then raise exception 'expired'; end if;
  -- expirou: o cliente chama end_call 'timeout' (raise desfaria update aqui).
  if c.created_at < now() - interval '90 seconds' then raise exception 'expired'; end if;
  update public.calls set status = 'accepted', accepted_at = now() where id = p_call;
  return jsonb_build_object('accepted', true);
end;
$$;

-- ---------- RPC: encerrar (cancelar/recusar/timeout/desligar) ----------

create or replace function public.end_call(p_call uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  c public.calls%rowtype;
  final text;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  if p_action is null or p_action not in ('cancel', 'reject', 'timeout', 'hangup') then
    raise exception 'invalid_body';
  end if;
  select * into c from public.calls where id = p_call;
  if not found then raise exception 'not_found'; end if;
  if me_id <> c.caller_id and me_id <> c.callee_id then raise exception 'forbidden'; end if;
  if c.status not in ('ringing', 'accepted') then
    return jsonb_build_object('status', c.status);
  end if;

  final := case
    when c.status = 'ringing' and p_action = 'cancel' and me_id = c.caller_id then 'ended'
    when c.status = 'ringing' and p_action = 'reject' and me_id = c.callee_id then 'rejected'
    when c.status = 'ringing' and p_action = 'timeout' then 'missed'
    when c.status = 'ringing' then 'missed'
    else 'ended'
  end;
  update public.calls set status = final, ended_at = now() where id = p_call;
  return jsonb_build_object('status', final);
end;
$$;

-- ---------- RPC: ler chamada (qualquer lado) ----------

create or replace function public.get_call(p_call uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := auth.uid();
  c public.calls%rowtype;
  peer public.profiles%rowtype;
begin
  if me_id is null then raise exception 'unauthorized'; end if;
  select * into c from public.calls where id = p_call;
  if not found then raise exception 'not_found'; end if;
  if me_id <> c.caller_id and me_id <> c.callee_id then raise exception 'forbidden'; end if;
  select * into peer from public.profiles
  where id = case when me_id = c.caller_id then c.callee_id else c.caller_id end;
  return jsonb_build_object(
    'id', c.id, 'conversation_id', c.conversation_id, 'kind', c.kind, 'status', c.status,
    'am_caller', me_id = c.caller_id,
    'peer', jsonb_build_object('id', peer.id, 'username', peer.username,
      'display_name', peer.display_name, 'avatar_url', peer.avatar_url));
end;
$$;

-- ---------- grants explícitos ----------

grant select on public.calls to authenticated;
grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.accept_call(uuid) to authenticated;
grant execute on function public.end_call(uuid, text) to authenticated;
grant execute on function public.get_call(uuid) to authenticated;
