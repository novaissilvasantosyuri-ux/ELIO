-- Fumaça Fase 6: chamadas 1-a-1 (após stubs + 0001..0010 + smokes).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. iniciar/atender/desligar ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         c jsonb; ok boolean; begin
  c := public.start_call(dm, 'video');
  assert (c->>'callee_id') = '88888888-8888-8888-8888-888888888888', 'callee errado';
  -- segunda chamada na mesma conversa: ocupada
  begin perform public.start_call(dm, 'voice'); ok := false;
  exception when others then ok := (sqlerrm = 'busy'); end;
  assert ok, 'deveria estar ocupada (busy)';
  -- quem liga não atende a própria
  begin perform public.accept_call((c->>'id')::uuid); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'quem liga não deveria atender (forbidden)';
end $$;

select set_config('app.uid', '88888888-8888-8888-8888-888888888888', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         cid uuid := (select id from public.calls where conversation_id = dm
                      order by created_at desc limit 1);
         g jsonb; begin
  perform public.accept_call(cid);
  g := public.get_call(cid);
  assert (g->>'status') = 'accepted', 'deveria estar aceita';
  assert (g->>'am_caller')::boolean = false, 'am_caller errado';
  assert (g->'peer'->>'username') = 'gabi.teste', 'peer errado';
  perform public.end_call(cid, 'hangup');
  assert (select status from public.calls where id = cid) = 'ended', 'deveria terminar';
end $$;

-- ---------- 2. recusar / cancelar / timeout ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         a uuid := (public.start_call(dm, 'voice')->>'id')::uuid;
         e jsonb; begin
  -- estranho não encerra
  perform set_config('app.uid', '99999999-9999-9999-9999-999999999999', true);
  begin perform public.end_call(a, 'hangup');
  exception when others then
    assert sqlerrm = 'forbidden', 'estranho não deveria encerrar (forbidden)';
  end;
  perform set_config('app.uid', '77777777-7777-7777-7777-777777777777', true);
  e := public.end_call(a, 'cancel');
  assert (e->>'status') = 'ended', 'cancelar deveria encerrar';
end $$;

select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         a uuid := (public.start_call(dm, 'voice')->>'id')::uuid; begin
  perform set_config('app.uid', '88888888-8888-8888-8888-888888888888', true);
  assert (public.end_call(a, 'reject')->>'status') = 'rejected', 'recusar deveria rejeitar';
end $$;

select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct'
                          order by created_at desc limit 1);
         a uuid := (public.start_call(dm, 'voice')->>'id')::uuid;
         ok boolean; begin
  -- envelhece 3 minutos e tenta atender: expira; timeout marca missed
  update public.calls set created_at = now() - interval '3 minutes' where id = a;
  perform set_config('app.uid', '88888888-8888-8888-8888-888888888888', true);
  begin perform public.accept_call(a); ok := false;
  exception when others then ok := (sqlerrm = 'expired'); end;
  assert ok, 'antiga deveria expirar (expired)';
  assert (public.end_call(a, 'timeout')->>'status') = 'missed', 'deveria virar não atendida';
end $$;

-- ---------- 3. grupo não liga; bloqueio impede ----------
select set_config('app.uid', '77777777-7777-7777-7777-777777777777', false);
do $$ declare gid uuid := (select id from public.conversations where type = 'group' limit 1);
         dm uuid := (select id from public.conversations where type = 'direct'
                     order by created_at desc limit 1);
         ok boolean; begin
  begin perform public.start_call(gid, 'voice'); ok := false;
  exception when others then ok := (sqlerrm = 'not_direct'); end;
  assert ok, 'grupo deveria falhar (not_direct)';
  insert into public.blocks (blocker_id, blocked_id)
  values ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');
  begin perform public.start_call(dm, 'voice'); ok := false;
  exception when others then ok := (sqlerrm = 'blocked'); end;
  assert ok, 'bloqueio deveria impedir (blocked)';
  delete from public.blocks
  where blocker_id = '77777777-7777-7777-7777-777777777777'
    and blocked_id = '88888888-8888-8888-8888-888888888888';
end $$;

select 'SMOKE-6-OK' as ok;
