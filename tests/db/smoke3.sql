-- Fumaça de comunidades e canais (após stubs + 0001..0007 + smokes).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. criar comunidade (nasce com #geral + #anúncios) ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (public.create_community('Bairro Alto', 'Vizinhança')  ->>'id')::uuid;
         ok boolean; begin
  assert (select role from public.community_members
          where community_id = cid and user_id = '11111111-1111-1111-1111-111111111111') = 'owner', 'criadora deveria ser dona';
  assert (select count(*) from public.conversations
          where community_id = cid and type = 'channel') = 2, 'deveria nascer com 2 canais';
  assert exists (select 1 from public.conversations ch
          join public.messages m on m.conversation_id = ch.id
          where ch.community_id = cid and m.sender_id is null), 'msg de sistema ausente';
  assert char_length((select invite_code from public.communities where id = cid)) = 12,
    'deveria nascer com código de convite';

  begin perform public.create_community('   '); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_title'); end;
  assert ok, 'nome vazio deveria falhar (invalid_title)';
end $$;

-- ---------- 2. listar + detalhe; estranho não vê ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare mine jsonb := public.get_communities();
         one jsonb; detail jsonb; begin
  assert jsonb_array_length(mine) = 1, 'ana deveria ter 1 comunidade';
  one := mine->0;
  assert (one->>'my_role') = 'owner', 'my_role errado';
  assert jsonb_array_length(one->'channels') = 2, 'deveria listar 2 canais';
  detail := public.get_community((one->>'id')::uuid);
  assert jsonb_array_length(detail->'members') = 1, 'deveria listar 1 membro';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         ok boolean; begin
  assert jsonb_array_length(public.get_communities()) = 0, 'bruno não deveria ter comunidades';
  begin perform public.get_community(cid); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria ver detalhe (forbidden)';
end $$;

-- ---------- 3. entrar espelha os canais ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         r jsonb; begin
  r := public.join_community(cid);
  assert (r->>'joined')::boolean = true, 'entrar falhou';
  assert (select count(*) from public.conversation_members m
          join public.conversations ch on ch.id = m.conversation_id
          where ch.community_id = cid and m.user_id = '22222222-2222-2222-2222-222222222222') = 2,
    'espelho de canais falhou';
  r := public.join_community(cid);
  assert (r->>'joined')::boolean = false, 're-entrar deveria ser idempotente';
end $$;

-- ---------- 4. membro não administra ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         ok boolean; begin
  begin perform public.create_channel(cid, 'festas', false); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria criar canal (needs_admin)';
  begin perform public.update_community(cid, 'Hack', null); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria editar (needs_admin)';
  begin perform public.rotate_community_invite(cid); ok := false;
  exception when others then ok := (sqlerrm = 'needs_admin'); end;
  assert ok, 'membro não deveria gerar convite (needs_admin)';
end $$;

-- ---------- 5. anúncios: só dono/admin posta ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         news uuid := (select id from public.conversations
                       where community_id = cid and is_announcement limit 1);
         geral uuid := (select id from public.conversations
                        where community_id = cid and not is_announcement limit 1);
         ok boolean; begin
  begin perform public.send_message(news, gen_random_uuid(), 'oi', null); ok := false;
  exception when others then ok := (sqlerrm = 'read_only'); end;
  assert ok, 'membro não deveria postar em anúncios (read_only)';
  begin perform public.send_media(news, gen_random_uuid(), 'image', '', null, 'p', 'image/webp', 1, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'read_only'); end;
  assert ok, 'mídia de membro em anúncios deveria falhar (read_only)';
  perform public.send_message(geral, gen_random_uuid(), 'oi, vizinhos!', null);
end $$;

select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         news uuid := (select id from public.conversations
                       where community_id = cid and is_announcement limit 1); begin
  perform public.send_message(news, gen_random_uuid(), 'comunicado 📢', null);
end $$;

-- ---------- 6. papéis ----------
select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
do $$ declare cid uuid := (select id from public.communities limit 1); begin
  perform public.join_community(cid);
end $$;

select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (select id from public.communities limit 1); begin
  perform public.set_community_role(cid, '22222222-2222-2222-2222-222222222222', 'admin');
  perform public.set_community_role(cid, '33333333-3333-3333-3333-333333333333', 'moderator');
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         news uuid := (select id from public.conversations
                       where community_id = cid and is_announcement limit 1);
         ch uuid; ok boolean; begin
  -- admin posta em anúncios e cria canal
  perform public.send_message(news, gen_random_uuid(), 'aviso do admin', null);
  ch := (public.create_channel(cid, 'festas', false)->>'id')::uuid;
  assert (select count(*) from public.conversation_members where conversation_id = ch) = 3, 'canal novo sem espelho';
  begin perform public.create_channel(cid, 'FESTAS', false); ok := false;
  exception when others then ok := (sqlerrm = 'name_taken'); end;
  assert ok, 'canal duplicado deveria falhar (name_taken)';
  -- admin não mexe em papel
  begin perform public.set_community_role(cid, '33333333-3333-3333-3333-333333333333', 'member'); ok := false;
  exception when others then ok := (sqlerrm = 'needs_owner'); end;
  assert ok, 'admin não deveria mexer em papel (needs_owner)';
end $$;

-- ---------- 7. remover / sair / transferir ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         ok boolean; begin
  perform public.remove_community_member(cid, '33333333-3333-3333-3333-333333333333');
  assert not exists (select 1 from public.community_members
          where community_id = cid and user_id = '33333333-3333-3333-3333-333333333333'), 'remoção falhou';
  assert not exists (select 1 from public.conversation_members m
          join public.conversations ch on ch.id = m.conversation_id
          where ch.community_id = cid and m.user_id = '33333333-3333-3333-3333-333333333333'), 'espelho não limpou';

  begin perform public.remove_community_member(cid, '11111111-1111-1111-1111-111111111111'); ok := false;
  exception when others then ok := (sqlerrm = 'use_leave'); end;
  assert ok, 'auto-remoção deveria pedir leave (use_leave)';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         ok boolean; begin
  begin perform public.remove_community_member(cid, '11111111-1111-1111-1111-111111111111'); ok := false;
  exception when others then ok := (sqlerrm = 'cannot_remove_owner'); end;
  assert ok, 'remover dona deveria falhar';
end $$;

-- ---------- 8. convite ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         r jsonb; begin
  r := public.rotate_community_invite(cid);
  assert char_length(r->>'code') = 12, 'código deveria ter 12 chars';
end $$;

select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         code text := (select invite_code from public.communities where id = cid);
         r jsonb; ok boolean; begin
  r := public.join_community_by_invite(code);
  assert (r->>'joined')::boolean = true, 'entrar por convite falhou';
  begin perform public.join_community_by_invite('xxxx-errado'); ok := false;
  exception when others then ok := (sqlerrm = 'bad_code'); end;
  assert ok, 'código errado deveria falhar (bad_code)';
end $$;

-- ---------- 9. dono sai → transfere; último apaga; último canal protegido ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         r jsonb; begin
  perform public.set_community_role(cid, '22222222-2222-2222-2222-222222222222', 'owner');
  r := public.leave_community(cid);
  assert (r->>'deleted')::boolean = false, 'saída não deveria apagar';
  assert not exists (select 1 from public.community_members
          where community_id = cid and user_id = '11111111-1111-1111-1111-111111111111'), 'saída falhou';
end $$;

select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare tmp uuid := (public.create_community('Temp', '')->>'id')::uuid;
         geral uuid := (select id from public.conversations
                        where community_id = tmp and not is_announcement limit 1);
         news uuid := (select id from public.conversations
                       where community_id = tmp and is_announcement limit 1);
         r jsonb; ok boolean; begin
  perform public.delete_channel(geral);
  assert not exists (select 1 from public.conversations where id = geral), 'apagar canal falhou';
  begin perform public.delete_channel(news); ok := false;
  exception when others then ok := (sqlerrm = 'last_channel'); end;
  assert ok, 'último canal deveria ser protegido (last_channel)';
  r := public.leave_community(tmp);
  assert (r->>'deleted')::boolean = true, 'último a sair deveria apagar';
  assert not exists (select 1 from public.communities where id = tmp), 'comunidade temp ainda existe';
  assert not exists (select 1 from public.conversations where community_id = tmp), 'canais temp ainda existem';
end $$;

-- ---------- 10. explorar (público, sem vazar convite) ----------
select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare listed jsonb := public.explore_communities('');
         one jsonb; begin
  assert jsonb_array_length(listed) = 1, 'explorar deveria listar 1';
  one := listed->0;
  assert (one->>'name') = 'Bairro Alto', 'nome errado';
  assert (one->>'am_member')::boolean = false, 'eli não é membro';
  assert not (one ? 'invite_code'), 'VAZOU invite_code!';
  assert jsonb_array_length(public.explore_communities('zzz-nada')) = 0, 'busca deveria filtrar';
  assert jsonb_array_length(public.explore_communities('bairro')) = 1, 'busca deveria achar';
end $$;

-- ---------- 11. info do canal + lista inclui canais ----------
select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         news uuid := (select id from public.conversations
                       where community_id = cid and is_announcement limit 1);
         geral uuid := (select id from public.conversations
                        where community_id = cid and not is_announcement
                        order by title limit 1);
         info jsonb; convs jsonb; ch jsonb; begin
  info := public.get_channel_info(geral);
  assert (info->>'my_role') = 'member', 'papel errado';
  assert (info->>'can_post')::boolean = true, 'membro deveria postar no geral';
  info := public.get_channel_info(news);
  assert (info->>'can_post')::boolean = false, 'membro não deveria postar em anúncios';

  convs := public.get_conversations();
  select x into ch from jsonb_array_elements(convs) x where x->>'id' = geral::text;
  assert ch is not null, 'canal sumiu da lista';
  assert (ch->>'community_id') = cid::text, 'lista sem community_id';
end $$;

select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare cid uuid := (select id from public.communities limit 1);
         geral uuid := (select id from public.conversations
                        where community_id = cid and not is_announcement limit 1);
         dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         ok boolean; begin
  begin perform public.get_channel_info(geral); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria ver canal (forbidden)';
  begin perform public.get_channel_info(dm); ok := false;
  exception when others then ok := (sqlerrm = 'not_channel'); end;
  assert ok, 'DM deveria falhar (not_channel)';
end $$;

-- ---------- 12. RLS (como authenticated) ----------
select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.communities) = 0, 'estranho não deveria listar comunidades';
  assert (select count(*) from public.community_members) = 0, 'estranho não deveria ver membros';
end $$;
select set_config('app.uid', '44444444-4444-4444-4444-444444444444', false);
do $$ begin
  assert (select count(*) from public.communities) = 1, 'membro deveria ver a comunidade';
  assert (select count(*) from public.community_members) = 2, 'membro deveria ver membros (2)';
end $$;
reset role;

select 'SMOKE-3-OK' as status;
