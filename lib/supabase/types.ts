/**
 * Tipos das linhas e dos RPCs (espelham as migrations em /supabase).
 * Mantidos à mão na Fase 1; `supabase gen types` pode gerá-los depois.
 */

export type Presence = "online" | "away" | "busy" | "invisible";
export type Audience = "everyone" | "contacts" | "nobody";
export type ConversationType = "direct" | "group" | "channel" | "official" | "system" | "ai";
export type MessageType = "text" | "image" | "video" | "audio" | "file" | "call" | "system";
export type MemberRole = "owner" | "admin" | "member";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  status_text: string;
  status_emoji: string;
  presence: Presence;
  last_seen_at: string | null;
  onboarded_at: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  theme: "light" | "dark" | "auto";
  accent: string;
  font_size: "sm" | "md" | "lg";
  density: "comfortable" | "compact";
  reduce_motion: boolean;
  wallpaper: {
    value: { kind: "default" } | { kind: "gradient"; id: string } | { kind: "solid"; color: string } | { kind: "image"; url: string };
    blur: number;
    dim: number;
  };
  read_receipts: boolean;
  typing_indicators: boolean;
  show_last_seen: boolean;
  findable_by_username: boolean;
  addable_by: Audience;
  messages_from: Audience;
  sound_enabled: boolean;
  preview_text: boolean;
}

export interface LastMessage {
  id: string;
  type: MessageType;
  body: string;
  sender_id: string | null;
  sender_name: string;
  created_at: string;
}

/** Item da lista de conversas (retorno do RPC get_conversations). */
export interface ConversationItem {
  id: string;
  type: ConversationType;
  title: string;
  avatar_url: string | null;
  /** Fase 3: só preenchidos quando type === "channel". */
  community_id: string | null;
  is_announcement: boolean;
  /** Fase 3: fundido no cliente via /api/channels/[id] (só canal). */
  can_post?: boolean;
  /** Fase 4: 0 = desligado, 86400 = 24h, 604800 = 7 dias. */
  disappear_after: number;
  last_message_at: string | null;
  last_message: LastMessage | null;
  unread_count: number;
  peer: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    presence: Presence;
    last_seen_at: string | null;
    status_text: string;
    status_emoji: string;
  } | null;
  pinned_at: string | null;
  archived_at: string | null;
  muted_until: string | null;
  my_last_read_at: string | null;
  members_count: number;
  wallpaper: {
    value: { kind: "default" } | { kind: "gradient"; id: string } | { kind: "solid"; color: string } | { kind: "image"; url: string };
    blur: number;
    dim: number;
  } | null;
}

/** Mensagem do histórico (retorno do RPC get_messages). */
export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  client_id: string | null;
  type: MessageType;
  body: string;
  /** Fase 5: resposta da Elio IA (sender_id null, mas bolha normal). */
  is_ai: boolean;
  reply_to_id: string | null;
  reply_preview: { id: string; body: string; sender_name: string; sender_id: string | null } | null;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
  delivered_at: string | null;
  read_at: string | null;
  forwarded: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
  reactions: ReactionCount[];
  attachments: Attachment[];
}

/** Agregado de reações por emoji (retorno do get_messages). */
export interface ReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Anexo de mídia (sem caminho de storage: baixa por /api/attachments/[id]). */
export interface Attachment {
  id: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  filename: string;
}

export interface PinnedMessage {
  id: string;
  type: MessageType;
  body: string;
  sender_id: string | null;
  sender_name: string;
  created_at: string;
  pinned_at: string;
}

export interface ContactRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  presence: Presence;
  last_seen_at: string | null;
  status_text: string;
  status_emoji: string;
}

/** Membro de grupo (retorno do RPC get_group_members). */
export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  presence: Presence;
  role: MemberRole;
  joined_at: string;
}

export interface GroupInfo {
  conversation: {
    id: string;
    title: string;
    description: string;
    avatar_url: string | null;
    invite_code: string | null;
    members_count: number;
  };
  my_role: MemberRole;
  members: GroupMember[];
}

/* ================= COMUNIDADES (Fase 3) ================= */

export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Canal resumido (retorno dos RPCs get_communities / get_community). */
export interface ChannelSummary {
  id: string;
  title: string;
  is_announcement: boolean;
  last_message_at: string | null;
}

/** Comunidade da minha lista (retorno do RPC get_communities). */
export interface CommunityItem {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  my_role: CommunityRole;
  members_count: number;
  channels: ChannelSummary[];
}

/** Membro de comunidade (retorno do RPC get_community). */
export interface CommunityMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  presence: Presence;
  role: CommunityRole;
  joined_at: string;
}

/** Detalhe da comunidade (retorno do RPC get_community). */
export interface CommunityDetail {
  community: {
    id: string;
    name: string;
    description: string;
    avatar_url: string | null;
    invite_code: string;
    members_count: number;
  };
  my_role: CommunityRole;
  channels: ChannelSummary[];
  members: CommunityMember[];
}

/** Info do canal para o chat (retorno do RPC get_channel_info). */
export interface ChannelInfo {
  conversation: { id: string; title: string; is_announcement: boolean; community_id: string };
  community: { id: string; name: string; avatar_url: string | null };
  my_role: CommunityRole;
  can_post: boolean;
}

/** Item do Explorar (retorno do RPC explore_communities — sem invite_code). */
export interface ExploreItem {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  members_count: number;
  channels_count: number;
  am_member: boolean;
}

export interface ContactRequest {
  id: string;
  from_id: string;
  to_id: string;
  status: "pending" | "accepted" | "declined" | "canceled";
  created_at: string;
  other: ContactRow;
}

export interface FoundUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
}
