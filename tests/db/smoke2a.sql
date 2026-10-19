-- Fumaça dos grupos (rode após stubs + 0001..0005 + smoke.sql).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. mais usuários ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'c@t.com', '{"username":"carol.teste","display_name":"Carol"}'),
  ('44444444-4444-4444-4444-444444444444', 'd@t.com', '{"username":"dani.teste","display_name":"Dani"}'),
  ('55555555-5555-5555-5555-555555555555', 'e@t.com', '{"username":"eli.teste","display_name":"Eli"}');

do $$ begin
  assert (select count(*) from public.profiles) = 5, 'perfis deveriam ser 5';
end $$;

-- ---------- 2. criar grupo ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g uuid; info jsonb; ok boolean; begin
  g := (public.create_group('Família', array['22222222-2222-2222-2222-222222222222'::uuid])->>'id')::uuid;
  assert g is not null, 'create_group falhou';
  assert (select role from public.conversation_members
          where conversation_id = g and user_id = '11111111-1111-1111-1111-111111111111') = 'owner', 'criadora deveria ser dona';
  assert (select role from public.conversation_members
          where conversation_id = g and user_id = '22222222-2222-2222-2222-222222222222') = 'member', 'bruno deveria ser membro';
  assert (select count(*) from public.messages
          where conversation_id = g and sender_id is null) >= 1, 'msg de sistema ausente';

  info := public.get_group_members(g);
  assert (info->>'my_role') = 'owner', 'my_role errado';
  assert jsonb_array_length(info->'members') = 2, 'deveria listar 2 membros';

  begin perform public.create_group('Vazio', '{}'); ok := false;
  exception when others then ok := (sqlerrm = 'needs_members'); end;
  assert ok, 'grupo sem membros deveria falhar (needs_members)';

  begin perform public.create_group('   ', array['22222222-2222-2222-2222-222222222222'::uuid]); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_title'); end;
  assert ok, 'título vazio deveria falhar (invalid_title)';
end $$;

-- ---------- 3. membro comum não administra; estranho não vê nem escreve ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; begin
  assert (public.get_group_members(g)->>'my_role') = 'member', 'bruno deveria ser member';
  begin perform public.update_group(g, 'Hack', null); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria editar (needs_admin)';
  begin perform public.add_group_members(g, array['33333333-3333-3333-3333-333333333333'::uuid]); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria adicionar (needs_admin)';
end $$;

select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; begin
  begin perform public.get_group_members(g); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranha não deveria ver membros (forbidden)';
  begin perform public.send_message(g, gen_random_uuid(), 'oi', null); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranha não deveria escrever (forbidden)';
end $$;

-- ---------- 3b. não-membro não administra nada (regressão do NULL) ----------
select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; n int; begin
  select count(*) into n from public.conversation_members m where m.conversation_id = g;
  begin perform public.add_group_members(g, array['55555555-5555-5555-5555-555555555555'::uuid]); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'estranho não deveria adicionar (needs_admin)';
  begin perform public.remove_group_member(g, '22222222-2222-2222-2222-222222222222'); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'estranho não deveria remover (needs_admin)';
  begin perform public.set_member_role(g, '22222222-2222-2222-2222-222222222222', 'admin'); ok := false;
  exception when others then ok := (sqlerrm = 'needs_owner'); end;
  assert ok, 'estranho não deveria mexer em papel (needs_owner)';
  begin perform public.update_group(g, 'Hack3', null); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'estranho não deveria editar (needs_admin)';
  begin perform public.rotate_invite(g); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'estranho não deveria gerar convite (needs_admin)';
  begin perform public.leave_group(g); ok := false;
  exception when others then ok := (sqlerrm = 'not_member'); end;
  assert ok, 'estranho não deveria sair (not_member)';
  assert (select count(*) from public.conversation_members m
          where m.conversation_id = g) = n, 'tentativas de estranho mudaram membros!';
end $$;

-- ---------- 4. adicionar / papéis / remover ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         r jsonb; ok boolean; begin
  r := public.add_group_members(g, array['33333333-3333-3333-3333-333333333333'::uuid]);
  assert (r->>'added')::int = 1, 'adicionar carol falhou';
  assert (select count(*) from public.conversation_members m
          where m.conversation_id = g) = 3, 'grupo deveria ter 3';
  -- adicionar de novo: não duplica
  r := public.add_group_members(g, array['33333333-3333-3333-3333-333333333333'::uuid]);
  assert (r->>'added')::int = 0, 'duplicou membro';

  perform public.set_member_role(g, '22222222-2222-2222-2222-222222222222', 'admin');
  assert (select role from public.conversation_members m
          where m.conversation_id = g and m.user_id = '22222222-2222-2222-2222-222222222222') = 'admin', 'promoção falhou';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; begin
  begin perform public.set_member_role(g, '33333333-3333-3333-3333-333333333333', 'admin'); ok := false;
  exception when others then ok := (sqlerrm = 'needs_owner'); end;
  assert ok, 'admin não deveria mexer em papel (needs_owner)';

  -- admin remove membro comum
  perform public.remove_group_member(g, '33333333-3333-3333-3333-333333333333');
  assert not exists (select 1 from public.conversation_members m
          where m.conversation_id = g and m.user_id = '33333333-3333-3333-3333-333333333333'), 'remoção falhou';

  begin perform public.remove_group_member(g, '11111111-1111-1111-1111-111111111111'); ok := false;
  exception when others then ok := (sqlerrm = 'cannot_remove_owner'); end;
  assert ok, 'remover dona deveria falhar';

  begin perform public.remove_group_member(g, '22222222-2222-2222-2222-222222222222'); ok := false;
  exception when others then ok := (sqlerrm = 'use_leave'); end;
  assert ok, 'auto-remoção deveria pedir leave (use_leave)';
end $$;

-- ---------- 5. convite: gerar + entrar ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         r jsonb; begin
  r := public.add_group_members(g, array['33333333-3333-3333-3333-333333333333'::uuid]);
  assert (r->>'added')::int = 1, 're-adicionar carol falhou';
  r := public.rotate_invite(g);
  assert char_length(r->>'code') = 12, 'código deveria ter 12 chars';
end $$;

select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; begin
  begin perform public.rotate_invite(g); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria gerar convite (needs_admin)';
end $$;

select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         code text := (select invite_code from public.conversations where id = g);
         r jsonb; ok boolean; begin
  r := public.join_by_invite(code);
  assert (r->>'joined')::boolean = true, 'entrar pelo convite falhou';
  assert (r->>'id')::uuid = g, 'convite levou ao grupo errado';
  r := public.join_by_invite(code);
  assert (r->>'joined')::boolean = false, 're-entrar deveria ser idempotente';
  begin perform public.join_by_invite('codigo-errado-123'); ok := false;
  exception when others then ok := (sqlerrm = 'bad_code'); end;
  assert ok, 'código errado deveria falhar (bad_code)';
end $$;

-- ---------- 6. transferência de posse + saída do dono ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1); begin
  perform public.set_member_role(g, '22222222-2222-2222-2222-222222222222', 'owner');
  assert (select role from public.conversation_members m
          where m.conversation_id = g and m.user_id = '22222222-2222-2222-2222-222222222222') = 'owner', 'transferência falhou';
  assert (select role from public.conversation_members m
          where m.conversation_id = g and m.user_id = '11111111-1111-1111-1111-111111111111') = 'admin', 'ex-dona deveria virar admin';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         r jsonb; begin
  r := public.leave_group(g);
  assert (r->>'deleted')::boolean = false, 'grupo não deveria ser apagado';
  -- posse passa para a mais antiga (ana)
  assert (select role from public.conversation_members m
          where m.conversation_id = g and m.user_id = '11111111-1111-1111-1111-111111111111') = 'owner', 'posse não passou para a mais antiga';
end $$;

-- ---------- 7. editar nome/descrição ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1); begin
  perform public.update_group(g, 'Família Silva', 'Grupo da família ❤️');
  assert (select title from public.conversations where id = g) = 'Família Silva', 'nome não mudou';
  assert (select description from public.conversations where id = g) = 'Grupo da família ❤️', 'descrição não mudou';
end $$;

select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group' limit 1);
         ok boolean; begin
  begin perform public.update_group(g, 'Hack2', null); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria editar (needs_admin)';
end $$;

-- ---------- 8. último a sair apaga o grupo ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare g2 uuid := (public.create_group('Temp', array['44444444-4444-4444-4444-444444444444'::uuid])->>'id')::uuid;
         r jsonb; begin
  perform set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
  r := public.leave_group(g2);
  assert (r->>'deleted')::boolean = false, 'saída da dani não deveria apagar';
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
  r := public.leave_group(g2);
  assert (r->>'deleted')::boolean = true, 'última saída deveria apagar o grupo';
  assert not exists (select 1 from public.conversations where id = g2), 'grupo temporário ainda existe';
end $$;

-- ---------- 9. privacidade: quem não aceita ser adicionado fica de fora ----------
update public.user_settings set addable_by = 'nobody'
where user_id = '44444444-4444-4444-4444-444444444444';
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare ok boolean; begin
  begin perform public.create_group('Teste', array['44444444-4444-4444-4444-444444444444'::uuid]); ok := false;
  exception when others then ok := (sqlerrm = 'not_allowed'); end;
  assert ok, 'criar grupo com quem recusou deveria falhar (not_allowed)';
end $$;
update public.user_settings set addable_by = 'everyone'
where user_id = '44444444-4444-4444-4444-444444444444';

-- ---------- 10. lista mostra o nome de quem escreveu no grupo ----------
select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ declare g uuid := (select id from public.conversations where type = 'group'
                         and title = 'Família Silva' limit 1); begin
  perform public.send_message(g, gen_random_uuid(), 'oi, família!', null);
end $$;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare convs jsonb := public.get_conversations();
         grow jsonb; begin
  select x into grow from jsonb_array_elements(convs) x
  where x->>'type' = 'group' and x->>'title' = 'Família Silva';
  assert grow is not null, 'grupo sumiu da lista';
  assert (grow->'last_message'->>'sender_name') = 'Dani', 'lista deveria mostrar "Dani"';
  assert (grow->>'members_count')::int = 3, 'grupo deveria ter 3 membros';
end $$;

select 'SMOKE-2A-OK' as status;
