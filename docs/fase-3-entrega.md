# ELIO — Fase 3: Comunidades e canais (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (smoke + smoke2a + smoke2b + SMOKE-3-OK) · 22 testes unitários · build 59 rotas · E2E 1/1 · lint sem erros novos.

## (a) Resumo do que foi feito

- **Banco (migration 0007)**: tabelas `communities` e `community_members`; colunas `community_id` + `is_announcement` em `conversations`; bucket público `community-avatars` (leitura aberta, escrita só pela service role); RLS (só membro lê a comunidade e seus membros); 17 RPCs novos — `create_community` (nasce com #geral + #anúncios + código de convite de 12 letras), `get_communities`, `get_community`, `update_community`, `rotate_community_invite`, `join_community`, `join_community_by_invite`, `leave_community` (transfere a posse; último a sair apaga), `set_community_role` (só dono), `remove_community_member`, `create/update/delete_channel` (nunca o último; sem nome repetido), `get_channel_info` (meu papel + posso postar?), `explore_communities` (nunca vaza o convite) — mais `send_message`/`send_media`/`get_conversations` reescritos (guarda de anúncios + 2 campos novos).
- **Modelo**: canal = conversa `type='channel'` ligada à comunidade; entrar/sair espelha `conversation_members` (canais aparecem também na lista principal, estilo WhatsApp); canal de anúncios: só dono/admin posta (membro vê só-leitura); papéis `owner/admin/moderator/member` (moderador sem poderes em v1).
- **API (9 rotas)**: `GET/POST /api/communities`, `GET /api/communities/explore?q=`, `POST /api/communities/join` (código), `GET/PATCH /api/communities/[id]` (detalhe, editar, girar convite), `POST /api/communities/[id]/join`, `POST /api/communities/[id]/members` (papel/remover/sair), `POST /api/communities/[id]/channels`, `GET/POST /api/communities/[id]/avatar` (foto, admin+), `GET/PATCH/DELETE /api/channels/[id]` (info, renomear, apagar). Tudo com zod + rate limit + auditoria; erros novos mapeados (`not_channel`, `last_channel`, `name_taken`, mensagens no contexto "comunidade").
- **App**: página **Comunidades** (minhas, criar, entrar por código), **detalhe** (abas Canais/Membros/Dados: abrir canal, criar/renomear/apagar, papéis, remover, convite com copiar/gerar novo, foto, sair), **Explorar** (busca com debounce + entrar); canais na lista com `#` + 🔔 nos anúncios; cabeçalho do chat com `#`; composer bloqueado em anúncios para membros comuns ("Só dono e admin postam neste canal."); menu nav sem "Em breve".
- **Seed demo**: comunidade "Bairro Alto" (Ana dona, Bruno admin, Camila membro; canais #geral, #anúncios, #festas; convite `DEMO-BAIRRO1`).

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0007_communities.sql  (tabelas, bucket, RLS, 17 RPCs + 3 reescritos)
├─ tests/db/smoke3.sql                       (fumaça Fase 3, 12 seções)
├─ app/api/communities/route.ts              (listar + criar)
├─ app/api/communities/explore/route.ts      (buscar)
├─ app/api/communities/join/route.ts         (entrar por código)
├─ app/api/communities/[id]/route.ts         (detalhe + editar + girar convite)
├─ app/api/communities/[id]/join/route.ts    (entrar direto)
├─ app/api/communities/[id]/members/route.ts (papel/remover/sair)
├─ app/api/communities/[id]/channels/route.ts (criar canal)
├─ app/api/communities/[id]/avatar/route.ts  (foto: upload + redirect)
├─ app/api/channels/[id]/route.ts            (info + renomear + apagar)
├─ components/communities/CommunitiesView.tsx (lista + criar + convite)
├─ components/communities/CommunityDetail.tsx (canais/membros/dados)
├─ components/communities/ExploreView.tsx     (buscar + entrar)
└─ app/(app)/comunidades/[id]/page.tsx        (detalhe)
Alterados:
├─ lib/schemas.ts + lib/schemas.test.ts (6 schemas + 4 testes — 22/22 no total)
├─ lib/supabase/types.ts (ConversationItem +canal; 7 tipos de comunidade)
├─ app/api/_helpers.ts (escopo "community" + not_channel/last_channel/name_taken)
├─ lib/chat-hooks.ts (loadMeta funde can_post do canal)
├─ components/chat/ChatWindow.tsx (só-leitura + # + aviso de anúncios)
├─ components/layout/ConversationList.tsx (# + sino nos anúncios)
├─ components/layout/AppShell.tsx (nav sem "Em breve")
├─ app/(app)/comunidades/page.tsx + explorar/page.tsx (reais, não mais SoonPage)
├─ lib/features.ts (comentário)  messages/pt-BR.json (communities +36, explore +9)
├─ scripts/seed-demo.ts (comunidade demo)  docs/guia-supabase.md (0007)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: rode a migration `0007_communities.sql` após as anteriores (ordem: 0001→0007).
2. **App**: `cd elio && npm install && npm run dev` (mesmo `.env.local`; precisa da service key para a foto — a mesma do seed).
3. **Teste guiado** (Ana + aba anônima Bruno, após `npm run seed`):
   - Comunidades → veja "Bairro Alto" → abra → aba Canais → entre em #festas e mande "oi".
   - Como Camila (membro), abra #anúncios → o campo de texto some e aparece "Só dono e admin postam neste canal."
   - Como Ana, aba Dados → copie o convite → na aba do Bruno, Comunidades → 🔗 → cole → ele entra e ganha os 3 canais na lista de conversas com `#`.
   - Explorar → busque "bairro" → veja contadores (sem código de convite na tela).
   - Como Ana, Membros → ⋯ na Camila → Tornar moderadora; depois ⋯ → Remover → confirme.
   - Canais → ⋯ → Renomear; tente criar outro "festas" → deve negar (nome repetido); apagar o último canal → deve negar.
   - Dados → Editar nome/descrição; Foto → envie uma imagem; Gerar novo código → o antigo morre.
   - Sair da comunidade → some da lista e dos canais.

## (e) Checklist de aceite

- [x] Criar comunidade (nasce #geral + #anúncios + convite)
- [x] Listar minhas comunidades com papel e canais
- [x] Entrar direto (Explorar) e por código (Comunidades)
- [x] Entrar/sair espelha todos os canais
- [x] Anúncios só-leitura para membros (servidor + tela)
- [x] Criar/renomear/apagar canal (admin+; sem duplicar; nunca o último)
- [x] Papéis: só dono promove/rebaixa; admin+ remove; sair transfere/apaga
- [x] Convite: copiar, gerar novo (antigo morre), explorar nunca vaza código
- [x] Foto da comunidade (admin+; membros veem)
- [x] Canais na lista principal com `#` + sino
- [x] Textos em `messages/pt-BR.json`; sem fotos reais; sem "ponta a ponta"

## (f) Limitações conhecidas

1. Moderador é só um título em v1 (sem poderes próprios; poderes de moderação entram em fase futura).
2. Comunidades são abertas: qualquer logado entra pelo Explorar (sem aprovação/convite obrigatório).
3. Sem "sair de um canal só": sair da comunidade sai de todos os canais.
4. Sem paginação de membros (comunidades gigantes carregam a lista inteira).
5. Sem som/notificação especial para anúncios.
6. E2E cobre só as páginas públicas (fluxo autenticado depende do Supabase do usuário).

## Suposições registradas (Fase 3)

Canal é conversa com `community_id`; entrar/sair espelha todos os canais; anúncios = flag por canal (não tipo); dono sai → posse ao membro mais antigo (admin > moderador > membro, desempate por entrada); último a sair apaga a comunidade; limite 1000 membros / 50 canais; títulos únicos por comunidade (sem #); foto em bucket público servida por rota autenticada (permite trancar depois sem mudar o app).
