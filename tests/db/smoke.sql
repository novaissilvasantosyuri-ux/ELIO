-- Fumaça funcional do banco (rode após stubs + 0001..0004).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. dois usuários (trigger cria perfil, settings, consent, oficial) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@t.com', '{"username":"ana.teste","display_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@t.com', '{"username":"bruno.teste","display_name":"Bruno"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'perfis não criados';
  assert (select count(*) from public.user_settings) = 2, 'settings não criados';
  assert (select count(*) from public.conversation_members
          where conversation_id = '00000000-0000-0000-0000-000000000001') = 2, 'oficial sem membros';
  assert (select count(*) from public.messages
          where conversation_id = '00000000-0000-0000-0000-000000000001') >= 4, 'boas-vindas ausentes';
end $$;

-- ---------- 2. username / busca ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert public.username_available('ana.teste') = false, 'disponibilidade errada (ocupado)';
  assert public.username_available('livre.zzz') = true, 'disponibilidade errada (livre)';
  assert (public.find_by_username('bruno.teste')->>'username') = 'bruno.teste', 'busca por @ falhou';
  assert public.find_by_username('ana.teste') is null, 'busca retornou a si mesma';
end $$;

-- ---------- 3. DM + envio + leitura ----------
do $$ declare dm uuid; sent jsonb; begin
  dm := (public.create_dm('bruno.teste')->>'id')::uuid;
  assert dm is not null, 'create_dm falhou';
  assert (public.create_dm('bruno.teste')->>'created')::boolean = false, 'DM duplicada';
  sent := public.send_message(dm, gen_random_uuid(), '  oi, Bruno!  ', null);
  assert (sent->'message'->>'body') = 'oi, Bruno!', 'corpo não aparado';
  -- idempotência
  assert (public.send_message(dm, (sent->'message'->>'client_id')::uuid, 'outro texto', null)->>'duplicate')::boolean = true, 'idempotência falhou';
  assert (select count(*) from public.messages where conversation_id = dm) = 1, 'duplicou mensagem';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msgs jsonb; convs jsonb; dmrow jsonb; begin
  convs := public.get_conversations();
  assert jsonb_array_length(convs) = 2, 'lista do Bruno deveria ter 2 (oficial + DM)';
  select x into dmrow from jsonb_array_elements(convs) x where x->>'type' = 'direct';
  assert dmrow is not null, 'DM ausente na lista';
  assert (dmrow->>'unread_count')::int = 1, 'não-lidas deveria ser 1';
  msgs := public.get_messages(dm, null, null, 30);
  assert jsonb_array_length(msgs) = 1, 'histórico deveria ter 1';
  perform public.set_receipts(dm, (select array_agg((m->>'id')::uuid) from jsonb_array_elements(msgs) m),
                                   (select array_agg((m->>'id')::uuid) from jsonb_array_elements(msgs) m));
  convs := public.get_conversations();
  select x into dmrow from jsonb_array_elements(convs) x where x->>'type' = 'direct';
  assert (dmrow->>'unread_count')::int = 0, 'leitura não zerou não-lidas';
end $$;

-- recibo visível para a Ana?
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msgs jsonb := public.get_messages(dm, null, null, 30); begin
  assert (msgs->0->>'read_at') is not null, 'read_at não chegou à remetente';
end $$;

-- oficial é somente leitura
do $$ declare ok boolean := false; begin
  begin
    perform public.send_message('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'x', null);
  exception when others then ok := (sqlerrm = 'read_only');
  end;
  assert ok, 'oficial aceitou envio!';
end $$;

-- ---------- 4. contatos ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  perform public.create_contact_request('ana.teste');
  assert jsonb_array_length(public.get_contact_requests()) = 1, 'solicitação não criada';
end $$;
-- Ana aceita via UPDATE direto (RLS permite)
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
update public.contact_requests set status = 'accepted' where to_id = auth.uid();
do $$ begin
  assert (select count(*) from public.contacts) = 2, 'par de contatos não criado';
  assert jsonb_array_length(public.get_contacts()) = 1, 'get_contacts falhou';
end $$;

-- ---------- 5. RLS de verdade (como authenticated) ----------
set role authenticated;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert (select count(*) from public.messages) >= 5, 'Ana deveria ver oficial + DM';
  assert (select count(*) from public.profiles) = 2, 'Ana deveria ver Bruno (mesma DM)';
end $$;
-- insert direto em messages: proibido (só via RPC)
do $$ declare ok boolean := false; begin
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'hack');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'INSERT direto em messages passou pelo RLS!';
end $$;
-- bloqueio esconde perfil
insert into public.blocks (blocker_id, blocked_id)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'bloqueio não escondeu o perfil';
end $$;
-- DM some da lista de quem bloqueou
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert jsonb_array_length(public.get_conversations()) = 1, 'DM bloqueada continua na lista';
end $$;
reset role;

-- ---------- 6. presença filtrada + username com limite ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert jsonb_array_length(public.get_presence(array['11111111-1111-1111-1111-111111111111']::uuid[])) = 0, 'presença vazou com bloqueio';
end $$;
delete from public.blocks; -- desbloqueia para os próximos testes
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  perform public.change_username('ana.nova');
  assert (select username::text from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'ana.nova', 'troca de @ falhou';
  assert (public.change_username('ana.nova')->>'changed')::boolean = false, 'troca igual deveria ser no-op';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.change_username('bruno.teste');
  exception when others then ok := (sqlerrm = 'taken');
  end;
  assert ok, 'username duplicado passou!';
end $$;

-- ---------- 7. rate limit + realtime publication ----------
do $$ begin
  assert public.rate_limit_hit('t', now()) = 1, 'rate 1º hit';
  assert public.rate_limit_hit('t', now()) = 2, 'rate 2º hit';
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') >= 9, 'publication incompleta';
  assert (select count(*) from storage.buckets where id in ('avatars', 'banners', 'wallpapers')) = 3, 'buckets não criados';
end $$;

select 'SMOKE-SQL-OK' as resultado;
