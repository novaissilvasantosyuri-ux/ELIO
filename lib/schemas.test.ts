import { describe, expect, it } from "vitest";
import {
  channelPatchSchema,
  channelTitleSchema,
  communityMemberActionSchema,
  communityPatchSchema,
  createChannelSchema,
  createCommunitySchema,
  createConversationSchema,
  disappearingSchema,
  endCallSchema,
  groupDescSchema,
  groupTitleSchema,
  joinByInviteSchema,
  memberActionSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  startCallSchema,
} from "./schemas";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("schemas de grupo", () => {
  it("título: 1..60, aparado", () => {
    expect(groupTitleSchema.safeParse("  Família  ").data).toBe("Família");
    expect(groupTitleSchema.safeParse("").success).toBe(false);
    expect(groupTitleSchema.safeParse("   ").success).toBe(false);
    expect(groupTitleSchema.safeParse("x".repeat(61)).success).toBe(false);
  });

  it("descrição: até 300", () => {
    expect(groupDescSchema.safeParse("").success).toBe(true);
    expect(groupDescSchema.safeParse("x".repeat(301)).success).toBe(false);
  });

  it("criação: DM ou grupo (grupo exige 1..100 membros)", () => {
    expect(createConversationSchema.safeParse({ username: "ana" }).success).toBe(true);
    expect(createConversationSchema.safeParse({ group: { title: "G", member_ids: [UUID] } }).success).toBe(true);
    expect(createConversationSchema.safeParse({ group: { title: "G", member_ids: [] } }).success).toBe(false);
    expect(createConversationSchema.safeParse({ group: { title: "", member_ids: [UUID] } }).success).toBe(false);
    expect(createConversationSchema.safeParse({ group: { title: "G", member_ids: ["nao-uuid"] } }).success).toBe(false);
  });

  it("ações de membros: união discriminada", () => {
    expect(memberActionSchema.safeParse({ action: "add", member_ids: [UUID] }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "remove", user_id: UUID }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "role", user_id: UUID, role: "admin" }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "role", user_id: UUID, role: "super" }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "leave" }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "rotate_invite" }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "explodir" }).success).toBe(false);
  });

  it("convite: código 4..64", () => {
    expect(joinByInviteSchema.safeParse({ code: "abc123XYZ456" }).success).toBe(true);
    expect(joinByInviteSchema.safeParse({ code: "ab" }).success).toBe(false);
  });
});

describe("schemas de comunidade (Fase 3)", () => {
  it("criação: nome 1..60, descrição opcional até 300", () => {
    const ok = createCommunitySchema.safeParse({ name: "Bairro Alto" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.description).toBe("");
    expect(createCommunitySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createCommunitySchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(createCommunitySchema.safeParse({ name: "Ok", description: "x".repeat(301) }).success).toBe(false);
  });

  it("edição: nome/descrição opcionais ou girar convite", () => {
    expect(communityPatchSchema.safeParse({ name: "Novo" }).success).toBe(true);
    expect(communityPatchSchema.safeParse({ rotate_invite: true }).success).toBe(true);
    expect(communityPatchSchema.safeParse({ name: "" }).success).toBe(false);
    expect(communityPatchSchema.safeParse({ rotate_invite: "sim" }).success).toBe(false);
  });

  it("membros: papel (sem dono), remover ou sair", () => {
    expect(communityMemberActionSchema.safeParse({ action: "role", user_id: UUID, role: "moderator" }).success).toBe(true);
    expect(communityMemberActionSchema.safeParse({ action: "role", user_id: UUID, role: "owner" }).success).toBe(false);
    expect(communityMemberActionSchema.safeParse({ action: "remove", user_id: UUID }).success).toBe(true);
    expect(communityMemberActionSchema.safeParse({ action: "leave" }).success).toBe(true);
    expect(communityMemberActionSchema.safeParse({ action: "add", member_ids: [UUID] }).success).toBe(false);
  });

  it("canal: título sem #, até 60; anúncio é booleano", () => {
    expect(createChannelSchema.safeParse({ title: "festas" }).success).toBe(true);
    const news = createChannelSchema.safeParse({ title: "avisos", is_announcement: true });
    expect(news.success).toBe(true);
    expect(channelTitleSchema.safeParse("#geral").success).toBe(false);
    expect(channelTitleSchema.safeParse("fes#tas").success).toBe(false);
    expect(channelTitleSchema.safeParse("").success).toBe(false);
    expect(channelPatchSchema.safeParse({ title: "novo-nome" }).success).toBe(true);
    expect(channelPatchSchema.safeParse({ is_announcement: false }).success).toBe(true);
    expect(channelPatchSchema.safeParse({}).success).toBe(true);
  });
});

describe("schemas de push + sumiço (Fase 4)", () => {
  it("inscrição push: endpoint URL + chaves", () => {
    const good = { endpoint: "https://push.exemplo/x1", p256dh: "k", auth: "a" };
    expect(pushSubscriptionSchema.safeParse(good).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...good, endpoint: "não-url" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...good, p256dh: "" }).success).toBe(false);
    expect(pushUnsubscribeSchema.safeParse({ endpoint: "https://push.exemplo/x1" }).success).toBe(true);
    expect(pushUnsubscribeSchema.safeParse({ endpoint: "" }).success).toBe(false);
  });

  it("timer: só 0, 86400 ou 604800", () => {
    expect(disappearingSchema.safeParse({ seconds: 0 }).success).toBe(true);
    expect(disappearingSchema.safeParse({ seconds: 86400 }).success).toBe(true);
    expect(disappearingSchema.safeParse({ seconds: 604800 }).success).toBe(true);
    expect(disappearingSchema.safeParse({ seconds: 3600 }).success).toBe(false);
    expect(disappearingSchema.safeParse({ seconds: "24h" }).success).toBe(false);
  });
});

describe("schemas de chamada (Fase 6)", () => {
  it("iniciar: conversa uuid + voz/vídeo", () => {
    expect(startCallSchema.safeParse({ conversation_id: UUID, kind: "voice" }).success).toBe(true);
    expect(startCallSchema.safeParse({ conversation_id: UUID, kind: "video" }).success).toBe(true);
    expect(startCallSchema.safeParse({ conversation_id: "x", kind: "voice" }).success).toBe(false);
    expect(startCallSchema.safeParse({ conversation_id: UUID, kind: "holograma" }).success).toBe(false);
  });

  it("encerrar: 4 ações", () => {
    for (const action of ["cancel", "reject", "timeout", "hangup"]) {
      expect(endCallSchema.safeParse({ action }).success).toBe(true);
    }
    expect(endCallSchema.safeParse({ action: "sumir" }).success).toBe(false);
  });
});
