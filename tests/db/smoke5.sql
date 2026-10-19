-- Fumaça Fase 5: Elio IA (após stubs + 0001..0009 + smokes).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. criar/abrir é idempotente, nasce com saudação ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare a uuid := (public.get_or_create_ai_chat()->>'id')::uuid;
         b uuid := (public.get_or_create_ai_chat()->>'id')::uuid; begin
  assert a = b, 'deveria devolver o mesmo chat';
  assert (select type from public.conversations where id = a) = 'ai', 'tipo deveria ser ai';
  assert exists (select 1 from public.messages
                 where conversation_id = a and is_ai and sender_id is null), 'saudação ausente';
end $$;

-- ---------- 2. perguntar + responder; histórico marca is_ai ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare a uuid := (public.get_or_create_ai_chat()->>'id')::uuid;
         h jsonb; begin
  perform public.send_message(a, gen_random_uuid(), 'resuma: oi', null);
  perform public.ai_reply(a, 'Resumo: oi! 🙂');
  h := public.get_messages(a, null, null, 50);
  assert exists (select 1 from jsonb_array_elements(h) x
                 where (x->>'is_ai')::boolean = true
                   and x->>'sender_name' = 'Elio IA'
                   and x->>'body' = 'Resumo: oi! 🙂'), 'resposta IA ausente/errada';
end $$;

-- ---------- 3. limites: só no próprio chat ai, texto válido ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         ok boolean; begin
  begin perform public.ai_reply(dm, 'x'); ok := false;
  exception when others then ok := (sqlerrm = 'not_allowed'); end;
  assert ok, 'ai_reply fora do chat ai deveria falhar (not_allowed)';
  begin perform public.ai_reply((public.get_or_create_ai_chat()->>'id')::uuid, '   '); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_body'); end;
  assert ok, 'resposta vazia deveria falhar (invalid_body)';
end $$;

select set_config('app.uid', '99999999-9999-9999-9999-999999999999', false);
do $$ declare mine uuid := (public.get_or_create_ai_chat()->>'id')::uuid;
         others uuid := (select m.conversation_id from public.conversation_members m
                         join public.conversations c on c.id = m.conversation_id
                         where m.user_id = '77777777-7777-7777-7777-777777777777'
                           and c.type = 'ai' limit 1);
         ok boolean; begin
  assert mine <> others, 'cada um deveria ter seu chat';
  begin perform public.ai_reply(others, 'x'); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'responder no chat alheio deveria falhar (forbidden)';
end $$;

select 'SMOKE-5-OK' as ok;
