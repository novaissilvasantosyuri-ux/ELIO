/**
 * Seed de demonstração (dados 100% fictícios).
 * Cria 3 usuários demo + conversas de exemplo. Rode com: npm run seed
 * Requer SUPABASE_SERVICE_ROLE_KEY no .env.local (NUNCA commite).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const DEMOS = [
  { email: "ana.demo@elio.exemplo", password: "Demo1234!", username: "ana.clara", display_name: "Ana Clara" },
  { email: "bruno.demo@elio.exemplo", password: "Demo1234!", username: "bruno.costa", display_name: "Bruno Costa" },
  { email: "camila.demo@elio.exemplo", password: "Demo1234!", username: "camila.duarte", display_name: "Camila Duarte" },
];

async function ensureUser(d: (typeof DEMOS)[number]): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === d.email);
  if (found) {
    console.log(`✔ já existe: ${d.email}`);
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { username: d.username, display_name: d.display_name },
  });
  if (error || !data.user) throw new Error(`Falha ao criar ${d.email}: ${error?.message}`);
  console.log(`✔ criado: ${d.email} (senha: ${d.password})`);
  // garante perfil (o trigger costuma criar; isto é redundância segura)
  await admin.from("profiles").upsert(
    { id: data.user.id, username: d.username, display_name: d.display_name },
    { onConflict: "id" },
  );
  await admin.from("user_settings").upsert({ user_id: data.user.id }, { onConflict: "user_id" });
  return data.user.id;
}

async function ensureDm(a: string, b: string): Promise<string> {
  const { data } = await admin
    .from("conversations")
    .select("id, conversation_members!inner(user_id)")
    .eq("type", "direct");
  const rows = (data ?? []) as Array<{ id: string; conversation_members: Array<{ user_id: string }> }>;
  const found = rows.find((c) => {
    const ids = c.conversation_members.map((m) => m.user_id);
    return ids.includes(a) && ids.includes(b) && ids.length === 2;
  });
  if (found) return found.id;
  const { data: conv, error } = await admin
    .from("conversations")
    .insert({ type: "direct" })
    .select("id")
    .single();
  if (error || !conv) throw new Error(`Falha ao criar DM: ${error?.message}`);
  await admin.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: a },
    { conversation_id: conv.id, user_id: b },
  ]);
  return conv.id as string;
}

async function ensureGroup(owner: string, adm: string, member: string): Promise<string> {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("type", "group")
    .eq("title", "Turma do café ☕")
    .limit(1);
  if (data && data.length > 0) return (data[0] as { id: string }).id;
  const { data: conv, error } = await admin
    .from("conversations")
    .insert({ type: "group", title: "Turma do café ☕", description: "Combinar os cafés da semana ☕", created_by: owner })
    .select("id")
    .single();
  if (error || !conv) throw new Error(`Falha ao criar grupo: ${error?.message}`);
  const gid = (conv as { id: string }).id;
  await admin.from("conversation_members").insert([
    { conversation_id: gid, user_id: owner, role: "owner" },
    { conversation_id: gid, user_id: adm, role: "admin" },
    { conversation_id: gid, user_id: member, role: "member" },
  ]);
  await admin.from("messages").insert([
    { conversation_id: gid, sender_id: null, type: "system", body: "Ana Clara criou o grupo" },
    { conversation_id: gid, sender_id: owner, client_id: randomUUID(), type: "text", body: "Bem-vindos ao grupo do café! ☕" },
    { conversation_id: gid, sender_id: adm, client_id: randomUUID(), type: "text", body: "Opa! Contem comigo 😄" },
  ]);
  // reação + fixada de exemplo
  const { data: welcome } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", gid)
    .eq("sender_id", owner)
    .limit(1)
    .single();
  const wid = (welcome as { id: string } | null)?.id;
  if (wid) {
    await admin.from("message_reactions").upsert(
      { message_id: wid, user_id: member, emoji: "❤️" },
      { onConflict: "message_id,user_id,emoji" },
    );
    await admin.from("messages").update({ pinned_at: new Date().toISOString(), pinned_by: owner }).eq("id", wid);
  }
  return gid;
}

async function ensureCommunity(owner: string, adm: string, member: string): Promise<string> {
  const { data } = await admin.from("communities").select("id").eq("name", "Bairro Alto").limit(1);
  if (data && data.length > 0) return (data[0] as { id: string }).id;
  const { data: comm, error } = await admin
    .from("communities")
    .insert({
      name: "Bairro Alto",
      description: "Vizinhança fictícia para testar o Elio 🏘️",
      created_by: owner,
      invite_code: "DEMO-BAIRRO1",
    })
    .select("id")
    .single();
  if (error || !comm) throw new Error(`Falha ao criar comunidade: ${error?.message}`);
  const cid = (comm as { id: string }).id;
  await admin.from("community_members").insert([
    { community_id: cid, user_id: owner, role: "owner" },
    { community_id: cid, user_id: adm, role: "admin" },
    { community_id: cid, user_id: member, role: "member" },
  ]);
  const mkChannel = async (title: string, announcement: boolean): Promise<string> => {
    const { data: ch, error: chError } = await admin
      .from("conversations")
      .insert({ type: "channel", title, community_id: cid, is_announcement: announcement, created_by: owner })
      .select("id")
      .single();
    if (chError || !ch) throw new Error(`Falha ao criar canal: ${chError?.message}`);
    const chid = (ch as { id: string }).id;
    await admin.from("conversation_members").insert([
      { conversation_id: chid, user_id: owner, role: "member" },
      { conversation_id: chid, user_id: adm, role: "member" },
      { conversation_id: chid, user_id: member, role: "member" },
    ]);
    return chid;
  };
  const geral = await mkChannel("geral", false);
  const news = await mkChannel("anúncios", true);
  await mkChannel("festas", false);
  await admin.from("messages").insert([
    { conversation_id: geral, sender_id: owner, client_id: randomUUID(), type: "text", body: "Bem-vindos ao Bairro Alto! 🏘️" },
    { conversation_id: geral, sender_id: member, client_id: randomUUID(), type: "text", body: "Opa! Cheguei 😄" },
    { conversation_id: news, sender_id: owner, client_id: randomUUID(), type: "text", body: "Comunicado: mutirão de sábado às 9h 📢" },
  ]);
  return cid;
}

async function main(): Promise<void> {
  const ids: string[] = [];
  for (const d of DEMOS) ids.push(await ensureUser(d));
  const [ana, bruno, camila] = ids as [string, string, string];

  // contato Ana ↔ Bruno
  await admin.from("contacts").upsert(
    [
      { user_id: ana, contact_id: bruno },
      { user_id: bruno, contact_id: ana },
    ],
    { onConflict: "user_id,contact_id" },
  );

  // DM Ana ↔ Bruno com histórico fictício
  const dm = await ensureDm(ana, bruno);
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", dm);
  if ((count ?? 0) === 0) {
    const base = Date.now() - 1000 * 60 * 60 * 3;
    const script: Array<[string, string, number]> = [
      [ana, "Oi, Bruno! Viu o Elio novo? 💜", 0],
      [bruno, "Vi sim! A interface tá linda demais", 5],
      [ana, "E o tema escuro? Ficou perfeito pra usar à noite", 9],
      [bruno, "Testei aqui, troca na hora sem piscar. Muito bom!", 14],
      [ana, "Depois me mostra como ficou seu papel de parede 😄", 60],
    ];
    for (const [sender, body, min] of script) {
      await admin.from("messages").insert({
        conversation_id: dm,
        sender_id: sender,
        client_id: randomUUID(),
        type: "text",
        body,
        created_at: new Date(base + min * 60000).toISOString(),
      });
    }
    console.log("✔ histórico demo criado na DM Ana ↔ Bruno");
  } else {
    console.log("✔ DM demo já tinha mensagens");
  }

  // DM vazia Bruno ↔ Camila (para testar lista/estado vazio)
  await ensureDm(bruno, camila);
  console.log("✔ DM Bruno ↔ Camila pronta");

  // Grupo demo: Ana (dona), Bruno (admin), Camila (membro)
  await ensureGroup(ana, bruno, camila);
  console.log("✔ Grupo demo pronto");

  // Comunidade demo: Ana (dona), Bruno (admin), Camila (membro)
  await ensureCommunity(ana, bruno, camila);
  console.log("✔ Comunidade demo pronta (convite: DEMO-BAIRRO1)");
  console.log("\nPronto! Entre com ana.demo@elio.exemplo / Demo1234! (ou bruno/camila).");
}

main().catch((e) => {
  console.error("Seed falhou:", e);
  process.exit(1);
});
