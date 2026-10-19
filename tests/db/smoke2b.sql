-- Fumaça de mídia/reações/edição/encaminhar/fixar (após stubs + 0001..0006 + smokes).
-- Falha com erro se qualquer expectativa quebrar.
\set ON_ERROR_STOP on

-- ---------- 1. reações ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (public.send_message(dm, gen_random_uuid(), 'mensagem p/ reagir', null)->'message'->>'id')::uuid;
         r jsonb; ok boolean; begin
  -- ana reage 👍
  r := public.toggle_reaction(msg, '👍');
  assert (r->>'reacted')::boolean = true, 'reagir deveria voltar reacted=true';
  assert (r->'counts'->0->>'count')::int = 1, 'contagem deveria ser 1';
  assert (r->'counts'->0->>'mine')::boolean = true, 'mine deveria ser true p/ ana';

  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
  -- bruno reage 👍 também
  r := public.toggle_reaction(msg, '👍');
  assert (r->'counts'->0->>'count')::int = 2, 'contagem deveria ser 2';
  -- bruno reage ❤️
  r := public.toggle_reaction(msg, '❤️');
  assert jsonb_array_length(r->'counts') = 2, 'deveria haver 2 emojis';
  -- bruno tira o ❤️
  r := public.toggle_reaction(msg, '❤️');
  assert (r->>'reacted')::boolean = false, 'tirar deveria voltar reacted=false';
  assert jsonb_array_length(r->'counts') = 1, 'deveria sobrar 1 emoji';
  -- bruno põe ❤️ de volta (p/ o passo 2)
  perform public.toggle_reaction(msg, '❤️');

  -- emoji inválido
  begin perform public.toggle_reaction(msg, ''); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_emoji'); end;
  assert ok, 'emoji vazio deveria falhar (invalid_emoji)';
  begin perform public.toggle_reaction(msg, repeat('x', 17)); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_emoji'); end;
  assert ok, 'emoji longo deveria falhar (invalid_emoji)';
end $$;

-- ---------- 2. histórico traz reações ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msgs jsonb := public.get_messages(dm, null, null, 30);
         m jsonb; thumbs jsonb; heart jsonb; begin
  select x into m from jsonb_array_elements(msgs) x where x->>'body' = 'mensagem p/ reagir';
  assert m is not null, 'mensagem de teste sumiu';
  select x into thumbs from jsonb_array_elements(m->'reactions') x where x->>'emoji' = '👍';
  select x into heart from jsonb_array_elements(m->'reactions') x where x->>'emoji' = '❤️';
  assert (thumbs->>'count')::int = 2 and (thumbs->>'mine')::boolean = true, '👍 deveria ser 2/mine';
  assert (heart->>'count')::int = 1 and (heart->>'mine')::boolean = false, '❤️ deveria ser 1/alheio';
end $$;

-- ---------- 3. reação bloqueada em DM com bloqueio ----------
insert into public.blocks (blocker_id, blocked_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (select id from public.messages where conversation_id = dm
                      and body = 'mensagem p/ reagir' limit 1);
         ok boolean; begin
  begin perform public.toggle_reaction(msg, '😮'); ok := false;
  exception when others then ok := (sqlerrm = 'blocked'); end;
  assert ok, 'reação com bloqueio deveria falhar (blocked)';
end $$;
delete from public.blocks where blocker_id = '22222222-2222-2222-2222-222222222222';

-- ---------- 4. edição ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (select id from public.messages where conversation_id = dm
                      and body = 'mensagem p/ reagir' limit 1);
         old uuid; media uuid; r jsonb; ok boolean; begin
  r := public.edit_message(msg, '  texto editado  ');
  assert (r->>'body') = 'texto editado', 'edição não aparou';
  assert (select is_edited from public.messages where id = msg) = true, 'is_edited não marcou';

  begin perform public.edit_message(msg, ''); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_body'); end;
  assert ok, 'editar p/ vazio deveria falhar (invalid_body)';

  -- mensagem antiga (1h) não edita
  insert into public.messages (conversation_id, sender_id, client_id, type, body, created_at)
  values (dm, '11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'text', 'velha', now() - interval '1 hour')
  returning id into old;
  begin perform public.edit_message(old, 'nova'); ok := false;
  exception when others then ok := (sqlerrm = 'too_old'); end;
  assert ok, 'mensagem antiga deveria falhar (too_old)';

  -- mídia não edita texto
  insert into public.messages (conversation_id, sender_id, client_id, type, body)
  values (dm, '11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'image', 'legenda')
  returning id into media;
  begin perform public.edit_message(media, 'outra'); ok := false;
  exception when others then ok := (sqlerrm = 'not_editable'); end;
  assert ok, 'mídia deveria falhar (not_editable)';
end $$;

select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (select id from public.messages where conversation_id = dm
                      and body = 'texto editado' limit 1);
         ok boolean; begin
  begin perform public.edit_message(msg, 'hack'); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'editar msg alheia deveria falhar (forbidden)';
end $$;

-- ---------- 5. encaminhar ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         grp uuid := (select id from public.conversations where title = 'Família Silva' limit 1);
         src uuid := (select id from public.messages where conversation_id = dm
                      and body = 'texto editado' limit 1);
         sys uuid := (select id from public.messages
                      where conversation_id = '00000000-0000-0000-0000-000000000001'
                        and sender_id is null limit 1);
         att uuid; fwd uuid; ok boolean; begin
  -- anexo no original
  insert into public.attachments (message_id, storage_path, mime, size_bytes, width, height)
  values (src, 'chat-media/x/foto.webp', 'image/webp', 12345, 800, 600)
  returning id into att;

  fwd := (public.forward_message(src, grp)->>'id')::uuid;
  assert (select forwarded from public.messages where id = fwd) = true, 'cópia sem flag forwarded';
  assert (select sender_id from public.messages where id = fwd) = '11111111-1111-1111-1111-111111111111', 'cópia com autor errado';
  assert (select count(*) from public.attachments where message_id = fwd) = 1, 'anexo não foi junto';
  assert (select storage_path from public.attachments where message_id = fwd) = 'chat-media/x/foto.webp', 'anexo aponta p/ outro arquivo';

  -- oficial é somente leitura
  begin perform public.forward_message(src, '00000000-0000-0000-0000-000000000001'); ok := false;
  exception when others then ok := (sqlerrm = 'read_only'); end;
  assert ok, 'encaminhar p/ oficial deveria falhar (read_only)';

  -- sistema não encaminha
  begin perform public.forward_message(sys, grp); ok := false;
  exception when others then ok := (sqlerrm = 'not_forwardable'); end;
  assert ok, 'msg de sistema deveria falhar (not_forwardable)';
end $$;

-- ---------- 6. fixar ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (select id from public.messages where conversation_id = dm
                      and body = 'texto editado' limit 1);
         sys uuid := (select id from public.messages
                      where conversation_id = '00000000-0000-0000-0000-000000000001'
                        and sender_id is null limit 1);
         pins jsonb; ok boolean; begin
  assert (public.pin_message(msg, true)->>'pinned')::boolean = true, 'fixar falhou';
  pins := public.get_pinned(dm);
  assert jsonb_array_length(pins) = 1, 'lista de fixadas deveria ter 1';
  assert (pins->0->>'sender_name') = 'Ana Clara' or (pins->0->>'sender_name') = 'Ana', 'nome do autor errado na fixada';
  perform public.pin_message(msg, false);
  assert jsonb_array_length(public.get_pinned(dm)) = 0, 'desafixar falhou';

  begin perform public.pin_message(sys, true); ok := false;
  exception when others then ok := (sqlerrm = 'not_pinnable'); end;
  assert ok, 'fixar sistema deveria falhar (not_pinnable)';
end $$;

-- ---------- 7. estranho não mexe em nada ----------
select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msg uuid := (select id from public.messages where conversation_id = dm limit 1);
         ok boolean; begin
  begin perform public.toggle_reaction(msg, '👍'); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria reagir (forbidden)';
  begin perform public.pin_message(msg, true); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria fixar (forbidden)';
  begin perform public.get_pinned(dm); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria listar fixadas (forbidden)';
  begin perform public.forward_message(msg, dm); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria encaminhar (forbidden)';
end $$;

-- ---------- 8. RLS de anexos (como authenticated) + sem vazar caminho ----------
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         n int; begin
  select count(*) into n from public.attachments a
  join public.messages m on m.id = a.message_id where m.conversation_id = dm;
  assert n >= 1, 'membro deveria ver os anexos da DM';
end $$;
select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         n int; begin
  select count(*) into n from public.attachments a
  join public.messages m on m.id = a.message_id where m.conversation_id = dm;
  assert n = 0, 'estranho não deveria ver anexos';
end $$;
reset role;

-- o histórico nunca expõe o caminho no storage
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         msgs jsonb := public.get_messages(dm, null, null, 30);
         m jsonb; begin
  select x into m from jsonb_array_elements(msgs) x where x->>'body' = 'texto editado';
  assert jsonb_array_length(m->'attachments') = 1, 'anexo sumiu do histórico';
  assert (m->'attachments'->0->>'mime') = 'image/webp', 'mime errado';
  assert not (m->'attachments'->0 ? 'storage_path'), 'VAZOU storage_path!';
  assert (m->>'forwarded')::boolean = false, 'flag forwarded errada';
end $$;

-- ---------- 9. bucket privado de mídia ----------
do $$ begin
  assert exists (select 1 from storage.buckets where id = 'chat-media' and public = false),
    'bucket chat-media deveria existir e ser privado';
  assert not exists (select 1 from pg_policies where schemaname = 'storage'
                     and tablename = 'objects' and policyname ilike '%chat-media%'),
    'chat-media não deveria ter policy pública';
end $$;

-- ---------- 10. send_media (validações + idempotência) ----------
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         cid uuid := gen_random_uuid();
         r jsonb; mid uuid; ok boolean; begin
  r := public.send_media(dm, cid, 'image', '  pôr do sol  ', null,
    'chat-media/x/foto.webp', 'image/webp', 54321, 'foto.webp', 800, 600, null);
  assert (r->>'duplicate')::boolean = false, 'primeiro envio marcou duplicado';
  mid := (r->'message'->>'id')::uuid;
  assert (r->'message'->>'type') = 'image', 'tipo errado';
  assert (r->'message'->>'body') = 'pôr do sol', 'legenda não aparada';
  assert (select filename from public.attachments where message_id = mid) = 'foto.webp', 'filename não gravado';

  -- reenvio: idempotente
  r := public.send_media(dm, cid, 'image', 'outra', null,
    'chat-media/x/outra.webp', 'image/webp', 1, 'outra.webp', null, null, null);
  assert (r->>'duplicate')::boolean = true, 'reenvio deveria ser duplicado';
  assert (select count(*) from public.attachments where message_id = mid) = 1, 'duplicou anexo';

  -- tipo ruim / grande demais / legenda longa
  begin perform public.send_media(dm, gen_random_uuid(), 'exe', '', null, 'p', 'x/y', 1, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_type'); end;
  assert ok, 'tipo ruim deveria falhar (invalid_type)';
  begin perform public.send_media(dm, gen_random_uuid(), 'image', '', null, 'p', 'image/webp', 0, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'too_big'); end;
  assert ok, 'tamanho 0 deveria falhar (too_big)';
  begin perform public.send_media(dm, gen_random_uuid(), 'image', repeat('x', 1001), null, 'p', 'image/webp', 1, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'invalid_body'); end;
  assert ok, 'legenda longa deveria falhar (invalid_body)';

  -- oficial é somente leitura
  begin perform public.send_media('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'image', '', null, 'p', 'image/webp', 1, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'read_only'); end;
  assert ok, 'mídia na oficial deveria falhar (read_only)';
end $$;

select set_config('app.uid', '55555555-5555-5555-5555-555555555555', false);
do $$ declare dm uuid := (select id from public.conversations where type = 'direct' limit 1);
         ok boolean; begin
  begin perform public.send_media(dm, gen_random_uuid(), 'image', '', null, 'p', 'image/webp', 1, 'f', null, null, null); ok := false;
  exception when others then ok := (sqlerrm = 'forbidden'); end;
  assert ok, 'estranho não deveria enviar mídia (forbidden)';
end $$;

select 'SMOKE-2B-OK' as status;
