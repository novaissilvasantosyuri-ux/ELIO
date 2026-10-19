-- Fumaça Fase 4: push + mensagens que somem (após stubs + 0001..0008 + smokes).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. usuários + DM ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'g@t.com', '{"username":"gabi.teste","display_name":"Gabi"}'),
  ('88888888-8888-8888-8888-888888888888', 'h@t.com', '{"username":"hugo.teste","display_name":"Hugo"}'),
  ('99999999-9999-9999-9999-999999999999', 'i@t.com', '{"username":"ivy.teste","display_name":"Ivy"}');

select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (public.create_dm('hugo.teste')->>'id')::uuid; begin
  assert dm is not null, 'DM não criada';
end $$;

-- ---------- 2. push: salvar/upsert/alvos/silenciado/apagar ----------
select set_config('app.uid', '88888888-8888-8888-8888-888888888888', false);
do $$ begin
  perform public.save_push_subscription('https://push/x1', 'k1', 'a1');
  perform public.save_push_subscription('https://push/x1', 'k1n', 'a1n'); -- upsert
  assert (select p256dh from public.push_subscriptions
          where user_id = '88888888-8888-8888-8888-888888888888') = 'k1n', 'upsert falhou';
end $$;

select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         tg jsonb; ok boolean; begin
  perform public.save_push_subscription('https://push/x1', 'k2', 'a2'); -- mesmo endpoint, outro dono: ok
  tg := public.get_push_targets(dm);
  assert jsonb_array_length(tg) = 1, 'deveria ter 1 alvo (hugo)';
  assert (tg->0->>'user_id') = '88888888-8888-8888-8888-888888888888', 'alvo errado';
  assert (tg->0->>'preview_text')::boolean = true, 'preview default deveria ser true';
  -- invite/hugo silencia -> some dos alvos
  update public.conversation_members set muted_until = now() + interval '1 hour'
  where conversation_id = dm and user_id = '88888888-8888-8888-8888-888888888888';
  assert jsonb_array_length(public.get_push_targets(dm)) = 0, 'silenciado não deveria ser alvo';
  update public.conversation_members set muted_until = null
  where conversation_id = dm and user_id = '88888888-8888-8888-8888-888888888888';
  -- apagar o que não existe / o que existe
  assert (public.delete_push_subscription('https://push/nada')->>'deleted')::boolean = false, 'delete fantasma';
  assert (public.delete_push_subscription('https://push/x1')->>'deleted')::boolean = true, 'delete próprio falhou';
  -- endpoint vazio
  begin perform public.save_push_subscription('  ', 'k', 'a'); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_body'); end;
  assert ok, 'endpoint vazio deveria falhar (invalid_body)';
end $$;

-- ---------- 3. push: estranho e deslogado não veem alvos ----------
select set_config('app.uid', '99999999-9999-9999-9999-999999999999', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         ok boolean; begin
  begin perform public.get_push_targets(dm); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria ver alvos (forbidden)';
end $$;
select set_config('app.uid', '', false);
do $$ begin
  begin perform public.save_push_subscription('e', 'k', 'a');
  exception when others then
    assert sqlerrm = 'unauthorized', 'deslogado deveria falhar (unauthorized)';
  end;
end $$;

-- ---------- 4. timer na DM: liga, some, expurga ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         h jsonb; p jsonb; begin
  perform public.set_disappearing(dm, 86400);
  assert (select disappear_after from public.conversations where id = dm) = 86400, 'timer não ligou';
  assert exists (select 1 from public.messages where conversation_id = dm and sender_id is null
                 and body like '⏳%'), 'aviso de timer ausente';
  -- uma antiga (2 dias) + uma nova
  insert into public.messages (conversation_id, sender_id, client_id, type, body, created_at)
  values (dm, '77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'text', 'velha',
          now() - interval '2 days'),
         (dm, '88888888-8888-8888-8888-888888888888', gen_random_uuid(), 'text', 'nova', now());
  h := public.get_messages(dm, null, null, 50);
  assert not exists (select 1 from jsonb_array_elements(h) x where x->>'body' = 'velha'),
    'VAZOU mensagem expirada no histórico!';
  assert exists (select 1 from jsonb_array_elements(h) x where x->>'body' = 'nova'), 'nova sumiu sem dever';
  assert exists (select 1 from jsonb_array_elements(h) x where x->>'body' like '⏳%'),
    'sistema não deveria sumir';
  p := public.purge_expired_messages();
  assert (p->>'deleted')::int >= 1, 'purge deveria apagar ao menos 1';
  assert not exists (select 1 from public.messages where conversation_id = dm and body = 'velha'),
    'purge não apagou fisicamente';
end $$;

-- ---------- 5. timer: permissões por tipo ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare gid uuid := (public.create_group('Timer',
         array['88888888-8888-8888-8888-888888888888']::uuid[])->>'id')::uuid;
         cid uuid := (public.create_community('TimerComm', '')->>'id')::uuid;
         ch uuid; ok boolean; begin
  -- valor inválido
  begin perform public.set_disappearing(gid, 123); ok := false;
  exception when others then ok := (sqlerrm = 'bad_timer'); end;
  assert ok, 'timer inválido deveria falhar (bad_timer)';
  -- oficial é só-leitura
  begin perform public.set_disappearing('00000000-0000-0000-0000-000000000001', 86400); ok := false;
  exception when others then ok := (sqlerrm = 'read_only'); end;
  assert ok, 'oficial deveria falhar (read_only)';
  -- grupo: dona liga
  perform public.set_disappearing(gid, 604800);
  ch := (select id from public.conversations where community_id = cid and not is_announcement limit 1);
  perform public.set_disappearing(ch, 86400);
end $$;

select set_config('app.uid', '88888888-8888-8888-8888-888888888888', false);
do $$ declare gid uuid := (select id from public.conversations where type = 'group' and title = 'Timer' limit 1);
         cid uuid := (select id from public.communities where name = 'TimerComm' limit 1);
         ch uuid := (select id from public.conversations
                     where community_id = cid and not is_announcement limit 1);
         ok boolean; begin
  perform public.join_community(cid);
  begin perform public.set_disappearing(gid, 0); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria mexer no timer do grupo (needs_admin)';
  begin perform public.set_disappearing(ch, 0); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria mexer no timer do canal (needs_admin)';
  -- DM: qualquer lado pode
  perform public.set_disappearing(
    (select id from public.conversations where type = 'direct' order by created_at desc limit 1), 0);
end $$;

-- ---------- 6. lista ignora expirada na prévia ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         lst jsonb := public.get_conversations();
         one jsonb; begin
  perform public.set_disappearing(dm, 86400);
  insert into public.messages (conversation_id, sender_id, client_id, type, body, created_at)
  values (dm, '88888888-8888-8888-8888-888888888888', gen_random_uuid(), 'text', 'zz-antiga',
          now() - interval '2 days');
  lst := public.get_conversations();
  select x into one from jsonb_array_elements(lst) x where x->>'id' = dm::text;
  assert (one->>'disappear_after')::int = 86400, 'lista sem disappear_after';
  assert (one->'last_message'->>'body') <> 'zz-antiga', 'prévia VAZOU expirada!';
end $$;

select 'SMOKE-4-OK' as ok;
