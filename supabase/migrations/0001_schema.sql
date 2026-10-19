-- ============================================================
-- ELIO — 0001: esquema base (Fase 1: núcleo)
-- Rode na ordem: 0001 → 0002 → 0003 → 0004.
-- ============================================================

create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ---------- perfis ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text null,
  banner_url text null,
  accent_color text null,
  status_text text not null default '',
  status_emoji text not null default '',
  presence text not null default 'online'
    check (presence in ('online', 'away', 'busy', 'invisible')),
  last_seen_at timestamptz null,
  onboarded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_fmt check (username ~ '^[a-z0-9._]{3,20}$'),
  constraint display_name_len check (char_length(display_name) <= 40),
  constraint bio_len check (char_length(bio) <= 160),
  constraint status_len check (char_length(status_text) <= 80)
);
create index profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);

-- histórico de trocas de @ (limite: 3 a cada 30 dias)
create table public.username_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_username citext not null,
  new_username citext not null,
  changed_at timestamptz not null default now()
);
create index username_changes_user on public.username_changes (user_id, changed_at desc);

-- ---------- configurações do usuário ----------
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  accent text not null default '#4B1FB0',
  font_size text not null default 'md' check (font_size in ('sm', 'md', 'lg')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  reduce_motion boolean not null default false,
  wallpaper jsonb not null default '{"value":{"kind":"default"},"blur":0,"dim":0}',
  read_receipts boolean not null default true,
  typing_indicators boolean not null default true,
  show_last_seen boolean not null default true,
  findable_by_username boolean not null default true,
  addable_by text not null default 'everyone' check (addable_by in ('everyone', 'contacts', 'nobody')),
  messages_from text not null default 'everyone' check (messages_from in ('everyone', 'contacts', 'nobody')),
  sound_enabled boolean not null default true,
  preview_text boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- contatos / bloqueio / silêncio ----------
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  constraint no_self_request check (from_id <> to_id)
);
create unique index contact_requests_pending_unique
  on public.contact_requests (from_id, to_id) where status = 'pending';
create index contact_requests_to on public.contact_requests (to_id, status);
create index contact_requests_from on public.contact_requests (from_id, status);

-- 2 linhas por amizade (leitura simples); criadas por trigger no aceite
create table public.contacts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  constraint no_self_contact check (user_id <> contact_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table public.mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_user_id uuid not null references public.profiles (id) on delete cascade,
  until timestamptz null, -- null = para sempre
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  constraint no_self_mute check (user_id <> muted_user_id)
);

-- ---------- conversas ----------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct'
    check (type in ('direct', 'group', 'channel', 'official', 'system')),
  title text not null default '',
  avatar_url text null,
  created_by uuid null references public.profiles (id) on delete set null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_last_msg on public.conversations (last_message_at desc nulls last);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz null,
  last_read_message_id uuid null,
  pinned_at timestamptz null,
  archived_at timestamptz null,
  muted_until timestamptz null,
  cleared_at timestamptz null, -- "apagar conversa": esconde o que veio antes
  wallpaper jsonb null,         -- override de papel de parede só desta conversa
  primary key (conversation_id, user_id)
);
create index conversation_members_user on public.conversation_members (user_id);
create index conversation_members_conv on public.conversation_members (conversation_id);

-- ---------- mensagens ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid null references public.profiles (id) on delete set null, -- null = sistema
  client_id uuid null, -- idempotência (único por remetente)
  type text not null default 'text'
    check (type in ('text', 'image', 'audio', 'file', 'call', 'system')),
  body text not null default '',
  reply_to_id uuid null references public.messages (id) on delete set null,
  is_edited boolean not null default false,
  edited_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint message_body_len check (char_length(body) <= 4000)
);
create unique index messages_client_unique on public.messages (sender_id, client_id);
create index messages_conv_time on public.messages (conversation_id, created_at desc, id desc);

create table public.message_deletes (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.receipts (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delivered_at timestamptz null,
  read_at timestamptz null,
  primary key (message_id, user_id)
);
create index receipts_user on public.receipts (user_id);

-- ---------- consentimentos / textos legais / auditoria ----------
create table public.consents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('terms', 'ai')),
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  primary key (user_id, kind)
);

create table public.legal_texts (
  kind text not null check (kind in ('terms', 'privacy')),
  version text not null,
  title text not null,
  body_md text not null,
  published_at timestamptz not null default now(),
  primary key (kind, version)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid null references public.profiles (id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}',
  ip_hash text null,
  created_at timestamptz not null default now()
);
create index audit_log_user on public.audit_log (user_id, created_at desc);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);
