import { z } from "zod";

/** Schemas de validação (servidor; alguns reutilizados no cliente). */

export const uuidSchema = z.string().uuid();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^@+/, ""))
  .pipe(z.string().regex(/^[a-z0-9._]{3,20}$/));

export const displayNameSchema = z.string().trim().min(2).max(40);
export const bioSchema = z.string().trim().max(160);
export const statusTextSchema = z.string().trim().max(80);

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  username: usernameSchema,
  displayName: displayNameSchema,
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptTerms: z.literal(true),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export const profilePatchSchema = z.object({
  display_name: displayNameSchema.optional(),
  username: usernameSchema.optional(),
  bio: bioSchema.optional(),
  status_text: statusTextSchema.optional(),
  status_emoji: z.string().trim().max(16).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  avatar_url: z.string().trim().max(500).nullable().optional(),
  banner_url: z.string().trim().max(500).nullable().optional(),
  presence: z.enum(["online", "away", "busy", "invisible"]).optional(),
});

export const settingsPatchSchema = z.object({
  theme: z.enum(["light", "dark", "auto"]).optional(),
  accent: z.string().max(32).optional(),
  font_size: z.enum(["sm", "md", "lg"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  reduce_motion: z.boolean().optional(),
  wallpaper: z
    .object({
      value: z.union([
        z.object({ kind: z.literal("default") }),
        z.object({ kind: z.literal("gradient"), id: z.string().max(32) }),
        z.object({ kind: z.literal("solid"), color: z.string().max(16) }),
        z.object({ kind: z.literal("image"), url: z.string().max(500) }),
      ]),
      blur: z.number().min(0).max(20),
      dim: z.number().min(0).max(70),
    })
    .optional(),
  read_receipts: z.boolean().optional(),
  typing_indicators: z.boolean().optional(),
  show_last_seen: z.boolean().optional(),
  findable_by_username: z.boolean().optional(),
  addable_by: z.enum(["everyone", "contacts", "nobody"]).optional(),
  messages_from: z.enum(["everyone", "contacts", "nobody"]).optional(),
  sound_enabled: z.boolean().optional(),
  preview_text: z.boolean().optional(),
});

export const sendMessageSchema = z.object({
  conversation_id: uuidSchema,
  client_id: uuidSchema,
  body: z.string().trim().min(1).max(4000),
  reply_to_id: uuidSchema.nullable().optional(),
});

export const receiptsSchema = z.object({
  conversation_id: uuidSchema,
  delivered_ids: z.array(uuidSchema).max(100).optional().default([]),
  read_ids: z.array(uuidSchema).max(100).optional().default([]),
});

export const conversationPatchSchema = z.object({
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  muted_until: z.string().datetime({ offset: true }).nullable().optional(),
  mark_unread: z.boolean().optional(),
  clear: z.boolean().optional(),
  wallpaper: settingsPatchSchema.shape.wallpaper.nullable().optional(),
  group_title: z.string().trim().min(1).max(60).optional(),
  group_description: z.string().trim().max(300).optional(),
});

export const groupTitleSchema = z.string().trim().min(1).max(60);
export const groupDescSchema = z.string().trim().max(300);

/** POST /api/conversations: DM por @ ou criação de grupo. */
export const createConversationSchema = z.union([
  z.object({ username: usernameSchema }),
  z.object({
    group: z.object({
      title: groupTitleSchema,
      member_ids: z.array(uuidSchema).min(1).max(100),
    }),
  }),
]);

/** POST /api/conversations/[id]/members — ações de gestão do grupo. */
export const memberActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), member_ids: z.array(uuidSchema).min(1).max(100) }),
  z.object({ action: z.literal("remove"), user_id: uuidSchema }),
  z.object({ action: z.literal("role"), user_id: uuidSchema, role: z.enum(["owner", "admin", "member"]) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("rotate_invite") }),
]);

export const joinByInviteSchema = z.object({
  code: z.string().trim().min(4).max(64),
});

/* ================= COMUNIDADES (Fase 3) ================= */

export const communityNameSchema = z.string().trim().min(1).max(60);
export const communityDescSchema = z.string().trim().max(300);
export const channelTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^#\s][^#]*$/, "Sem # e sem espaço no começo.");

/** POST /api/communities — criar comunidade (nasce com #geral + #anúncios). */
export const createCommunitySchema = z.object({
  name: communityNameSchema,
  description: communityDescSchema.default(""),
});

/** PATCH /api/communities/[id] — editar dados ou girar convite (admin+). */
export const communityPatchSchema = z.object({
  name: communityNameSchema.optional(),
  description: communityDescSchema.optional(),
  rotate_invite: z.boolean().optional(),
});

/** POST /api/communities/[id]/members — gestão de papéis e saída. */
export const communityMemberActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("role"),
    user_id: uuidSchema,
    role: z.enum(["admin", "moderator", "member"]),
  }),
  z.object({ action: z.literal("remove"), user_id: uuidSchema }),
  z.object({ action: z.literal("leave") }),
]);

/** POST /api/communities/[id]/channels — criar canal (admin+). */
export const createChannelSchema = z.object({
  title: channelTitleSchema,
  is_announcement: z.boolean().default(false),
});

/** PATCH /api/channels/[id] — renomear ou virar anúncio (admin+). */
export const channelPatchSchema = z.object({
  title: channelTitleSchema.optional(),
  is_announcement: z.boolean().optional(),
});

/* ================= PUSH + SUMIÇO (Fase 4) ================= */

/** POST /api/push/subscribe — inscrição Web Push do navegador. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000).url(),
  p256dh: z.string().trim().min(1).max(500),
  auth: z.string().trim().min(1).max(500),
});

/** POST /api/push/unsubscribe — remove uma inscrição minha. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000),
});

/** POST /api/conversations/[id]/disappearing — timer (0, 24h, 7 dias). */
export const disappearingSchema = z.object({
  seconds: z.union([z.literal(0), z.literal(86400), z.literal(604800)]),
});

/* ================= ELIO IA (Fase 5) ================= */

/** POST /api/ia { text, client_id } — pergunta para a Elio IA. */
export const iaChatSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  client_id: uuidSchema,
});

/* ================= CHAMADAS (Fase 6) ================= */

/** POST /api/calls — iniciar chamada 1-a-1. */
export const startCallSchema = z.object({
  conversation_id: uuidSchema,
  kind: z.enum(["voice", "video"]),
});

/** POST /api/calls/[id]/end — encerrar. */
export const endCallSchema = z.object({
  action: z.enum(["cancel", "reject", "timeout", "hangup"]),
});

/** PATCH /api/messages/[id] — editar texto próprio. */
export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

/** POST /api/messages/[id]/reactions — reagir/tirar reação. */
export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

/** POST /api/messages/[id]/forward — encaminhar para outra conversa. */
export const forwardSchema = z.object({
  conversation_id: uuidSchema,
});

/** POST /api/messages/[id]/pin — fixar/desafixar. */
export const pinSchema = z.object({
  pinned: z.boolean(),
});

/** Metadados do upload de mídia (valores limitados no servidor). */
export const mediaMetaSchema = z.object({
  conversation_id: uuidSchema,
  client_id: uuidSchema,
  reply_to_id: uuidSchema.nullable().optional(),
  caption: z.string().trim().max(1000).optional().default(""),
  width: z.coerce.number().int().min(1).max(8000).nullable().optional(),
  height: z.coerce.number().int().min(1).max(8000).nullable().optional(),
  duration_s: z.coerce.number().int().min(1).max(7200).nullable().optional(),
});

export const contactRequestSchema = z.object({ username: usernameSchema });
export const contactRespondSchema = z.object({
  request_id: uuidSchema,
  action: z.enum(["accept", "decline", "cancel"]),
});
export const userIdSchema = z.object({ user_id: uuidSchema });
export const muteSchema = z.object({
  user_id: uuidSchema,
  until: z.string().datetime({ offset: true }).nullable(), // null = para sempre
});

export const paginationSchema = z.object({
  before_at: z.string().datetime({ offset: true }).optional(),
  before_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
