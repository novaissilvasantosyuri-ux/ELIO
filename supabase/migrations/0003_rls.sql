-- ============================================================
-- ELIO — 0003: RLS (tudo autorizado no servidor) + grants
-- Escrita sensível passa pelos RPCs; leitura direta é filtrada aqui.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.username_changes enable row level security;
alter table public.user_settings enable row level security;
alter table public.contact_requests enable row level security;
alter table public.contacts enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_deletes enable row level security;
alter table public.receipts enable row level security;
alter table public.consents enable row level security;
alter table public.legal_texts enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- ---------- profiles ----------
-- Visível para: você, quem conversa com você (1-a-1/grupo/canal — NÃO a oficial),
-- seus contatos. Bloqueio esconde nos dois sentidos.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    not public.is_blocked_between(auth.uid(), id)
    and (
      id = auth.uid()
      or exists (
        select 1 from public.conversation_members m1
        join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
        join public.conversations c on c.id = m1.conversation_id
        where m1.user_id = auth.uid()
          and m2.user_id = profiles.id
          and c.type in ('direct', 'group', 'channel')
      )
      or exists (
        select 1 from public.contacts
        where user_id = auth.uid() and contact_id = profiles.id
      )
    )
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- username_changes / settings / consents ----------
create policy "username_changes_select_own" on public.username_changes
  for select to authenticated using (user_id = auth.uid());

create policy "settings_all_own" on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "consents_all_own" on public.consents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- contact_requests ----------
create policy "contact_requests_select" on public.contact_requests
  for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Responder: quem recebeu aceita/recusa; quem enviou cancela. Criar: só via RPC.
create policy "contact_requests_update" on public.contact_requests
  for update to authenticated
  using (from_id = auth.uid() or to_id = auth.uid())
  with check (
    (to_id = auth.uid() and status in ('accepted', 'declined'))
    or (from_id = auth.uid() and status = 'canceled')
  );

-- ---------- contacts / blocks / mutes ----------
create policy "contacts_select_own" on public.contacts
  for select to authenticated using (user_id = auth.uid());

-- Qualquer lado pode remover a amizade (apaga o par).
create policy "contacts_delete" on public.contacts
  for delete to authenticated
  using (user_id = auth.uid() or contact_id = auth.uid());

create policy "blocks_all_own" on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create policy "mutes_all_own" on public.mutes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- conversations / members ----------
create policy "conversations_select_member" on public.conversations
  for select to authenticated using (public.is_member(id));

-- (usa is_member/SECURITY DEFINER: consultar a própria tabela aqui causaria recursão)
create policy "members_select_same_conv" on public.conversation_members
  for select to authenticated
  using (public.is_member(conversation_id));

-- Cada um edita só a própria linha (fixar, arquivar, silenciar, ler, wallpaper).
create policy "members_update_own" on public.conversation_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- messages / deletes / receipts ----------
create policy "messages_select_member" on public.messages
  for select to authenticated
  using (public.is_member(conversation_id));
-- insert/update/delete: somente via RPCs e rotas validadas (nenhuma policy = negado).

create policy "deletes_all_own" on public.message_deletes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "receipts_select_member" on public.receipts
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = receipts.message_id and public.is_member(m.conversation_id)
    )
  );
-- escrita de recibos: somente via RPC set_receipts.

-- ---------- legal / auditoria ----------
create policy "legal_select_all" on public.legal_texts
  for select to anon, authenticated using (true);

create policy "audit_select_own" on public.audit_log
  for select to authenticated using (user_id = auth.uid());
-- rate_limits: sem policies (só service_role). audit insert: só service_role.

-- ---------- grants explícitos (obrigatório em projetos novos) ----------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.legal_texts to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;

-- rate_limit_hit: só o servidor chama (revoga de todos os outros).
revoke all on function public.rate_limit_hit(text, timestamptz) from public, anon, authenticated;

-- ---------- realtime: tabelas publicadas + payload completo ----------
alter publication supabase_realtime add table
  public.messages, public.receipts, public.conversation_members,
  public.conversations, public.profiles, public.contact_requests,
  public.contacts, public.blocks, public.mutes;

alter table public.messages replica identity full;
alter table public.receipts replica identity full;
alter table public.conversation_members replica identity full;
alter table public.conversations replica identity full;
alter table public.profiles replica identity full;
alter table public.contact_requests replica identity full;
