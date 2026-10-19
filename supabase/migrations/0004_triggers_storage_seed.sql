-- ============================================================
-- ELIO — 0004: triggers + storage + seeds (oficial + textos legais)
-- ============================================================

-- ---------- updated_at ----------
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_settings_updated on public.user_settings;
create trigger trg_settings_updated
  before update on public.user_settings
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_conversations_updated on public.conversations;
create trigger trg_conversations_updated
  before update on public.conversations
  for each row execute function public.handle_updated_at();

-- ---------- última atividade da conversa ----------
create or replace function public.trg_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at, updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_last on public.messages;
create trigger trg_messages_last
  after insert on public.messages
  for each row execute function public.trg_last_message();

-- ---------- aceite de contato cria o par ----------
create or replace function public.trg_accept_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into public.contacts (user_id, contact_id)
    values (new.from_id, new.to_id), (new.to_id, new.from_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contact_accept on public.contact_requests;
create trigger trg_contact_accept
  after update on public.contact_requests
  for each row execute function public.trg_accept_contact();

-- ---------- conversa oficial seed (ID fixo) ----------
insert into public.conversations (id, type, title, created_by)
values ('00000000-0000-0000-0000-000000000001', 'official', 'Equipe ELIO', null)
on conflict (id) do nothing;

insert into public.messages (conversation_id, sender_id, type, body)
select '00000000-0000-0000-0000-000000000001', null, 'system', x.body
from (values
  ('Bem-vindo(a) à equipe! 🎉'),
  ('Dica 1: toque em “Nova conversa” e busque alguém pelo @usuário.'),
  ('Dica 2: no seu perfil você troca foto, status, tema e papel de parede.'),
  ('Dica 3: em Configurações → Privacidade você controla recibos de leitura, “visto por último” e quem pode te encontrar.')
) as x (body)
where not exists (
  select 1 from public.messages
  where conversation_id = '00000000-0000-0000-0000-000000000001'
);

-- ---------- novo usuário: perfil + padrões + oficial ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  cand text;
  i int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''),
                               '[^a-z0-9._]', '', 'g'));
  if base is null or length(base) < 3 then
    base := 'user_' || substr(md5(new.id::text), 1, 8);
  end if;
  cand := base;
  while exists (select 1 from public.profiles where username = cand::citext) loop
    i := i + 1;
    cand := substr(base, 1, 15) || i::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, cand::citext,
          left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), cand), 40));

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.consents (user_id, kind, version)
  values (new.id, 'terms', '1.0')
  on conflict (user_id, kind) do nothing;

  insert into public.conversation_members (conversation_id, user_id, role)
  values ('00000000-0000-0000-0000-000000000001', new.id, 'member')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- storage (avatares, banners, wallpapers) ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true),
       ('banners', 'banners', true),
       ('wallpapers', 'wallpapers', true)
on conflict (id) do update set public = excluded.public;

-- leitura pública (nomes de arquivo aleatórios, não listáveis por RLS de perfil)
drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');
drop policy if exists "public read banners" on storage.objects;
create policy "public read banners" on storage.objects
  for select to anon, authenticated using (bucket_id = 'banners');
drop policy if exists "public read wallpapers" on storage.objects;
create policy "public read wallpapers" on storage.objects
  for select to anon, authenticated using (bucket_id = 'wallpapers');

-- escrita: só na própria pasta {uid}/...
drop policy if exists "owner write avatars" on storage.objects;
create policy "owner write avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner update avatars" on storage.objects;
create policy "owner update avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner delete avatars" on storage.objects;
create policy "owner delete avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "owner write banners" on storage.objects;
create policy "owner write banners" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners'
              and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner update banners" on storage.objects;
create policy "owner update banners" on storage.objects
  for update to authenticated
  using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner delete banners" on storage.objects;
create policy "owner delete banners" on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "owner write wallpapers" on storage.objects;
create policy "owner write wallpapers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wallpapers'
              and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner update wallpapers" on storage.objects;
create policy "owner update wallpapers" on storage.objects
  for update to authenticated
  using (bucket_id = 'wallpapers' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "owner delete wallpapers" on storage.objects;
create policy "owner delete wallpapers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wallpapers' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- textos legais modelo (editáveis) ----------
insert into public.legal_texts (kind, version, title, body_md) values
('terms', '1.0', 'Termos de Uso',
'# Termos de Uso (modelo v1.0)

Bem-vindo(a) ao Elio (“Perto de quem importa”).

## 1. Sua conta
Você é responsável por manter sua senha em sigilo e por ter a idade mínima indicada no cadastro.

## 2. Uso respeitoso
Não use o Elio para spam, assédio, golpes ou qualquer conteúdo ilegal. Denúncias podem levar à suspensão da conta, com direito a esclarecimentos.

## 3. Seu conteúdo e seus dados
Suas mensagens são suas. Você pode exportar e excluir seus dados nas Configurações. Mantemos registros mínimos de segurança (ex.: acessos) pelo tempo necessário para proteger sua conta.

## 4. Segurança honesta
Usamos criptografia em trânsito (HTTPS) e boas práticas de proteção. **Não afirmamos criptografia de ponta a ponta nem segurança absoluta**: nenhum sistema é 100% à prova de falhas.

## 5. Mudanças
Podemos atualizar estes termos; mudanças importantes serão avisadas no app.'),
('privacy', '1.0', 'Política de Privacidade',
'# Política de Privacidade (modelo v1.0, LGPD)

## O que coletamos e por quê
- **Conta**: e-mail, @usuário e nome — para o app funcionar e você ser encontrado(a) (se permitir).
- **Perfil**: foto, bio e status — só o que você preencher.
- **Mensagens**: entregues e guardadas para sincronizar seus aparelhos. Nunca vendemos seus dados.
- **Segurança**: registros de acesso e limites antiabuso — para proteger sua conta.

## O que NÃO fazemos
Não vendemos dados, não mostramos anúncios baseados nas suas conversas e não afirmamos criptografia de ponta a ponta.

## Seus direitos (LGPD)
Acesso, correção, exportação e exclusão dos seus dados, direto no app (Configurações → Conta), além do canal privacidade@elio.app (troque pelo seu e-mail real).

## Retenção
Mantemos dados de conta enquanto ela existir; registros de segurança, por até 6 meses. Conta excluída tem seus dados pessoais removidos após o período de carência.')
on conflict (kind, version) do nothing;
