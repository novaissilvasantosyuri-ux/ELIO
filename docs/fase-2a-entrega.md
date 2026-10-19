# ELIO — Fase 2A: Grupos (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (SMOKE-SQL-OK + SMOKE-2A-OK) · 14 testes unitários · build 41 rotas · E2E 1/1.

## (a) Resumo do que foi feito

- **Banco (migration 0005)**: colunas `description` e `invite_code` (único) nas conversas; 9 RPCs novos — criar grupo, ver membros, adicionar, remover, papéis, sair, editar nome/descrição, gerar convite, entrar por convite; mensagens de sistema automáticas ("Ana criou o grupo", "Bruno saiu do grupo"…); lista de conversas agora mostra o nome de quem escreveu no grupo.
- **Papéis**: dono > admin > membro. Só o dono mexe em papéis (promover, rebaixar, transferir a posse); admins adicionam/removem/editam/geram convite; se o dono sai, a posse passa para o membro mais antigo; o último a sair apaga o grupo.
- **Convites**: código de 12 letras/números, visível para todos os membros, regenerável por admins (o antigo morre na hora).
- **API**: `POST /api/conversations` agora também cria grupos; `PATCH` edita nome/descrição (admins); novo `GET/POST /api/conversations/[id]/members` (gestão) e `POST /api/groups/join` (entrar por código). Erros novos com mensagens amigáveis em pt-BR.
- **Interface**: modal "Nova conversa" com 3 abas (Conversa | Grupo | Convite); seletor de contatos com busca; tela "Dados do grupo" (editar nome/descrição, convite com copiar/gerar, lista de membros com selos de papel, ações por pessoa, adicionar, sair); cabeçalho do grupo abre os dados; nome do remetente já aparecia nas mensagens de grupo.
- **Seed demo**: grupo "Turma do café ☕" (Ana dona, Bruno admin, Camila membro) com mensagens de exemplo.
- **Testes**: fumaça SQL nova (`tests/db/smoke2a.sql`, ~40 asserts incl. regressão de não-membro administrando); 5 testes de schemas (zod); E2E pública continua passando.

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0005_groups.sql      (grupos: colunas + 9 RPCs + ajuste na lista)
├─ tests/db/smoke2a.sql                     (fumaça dos grupos)
├─ app/api/conversations/[id]/members/route.ts  (GET dados + POST ações)
├─ app/api/groups/join/route.ts             (entrar por código)
├─ components/groups/MemberPicker.tsx       (seletor de contatos)
├─ components/groups/GroupInfo.tsx          (dados do grupo + gestão)
└─ lib/schemas.test.ts                      (5 testes de validação)
Alterados:
├─ lib/schemas.ts  app/api/_helpers.ts  lib/supabase/types.ts
├─ app/api/conversations/route.ts  app/api/conversations/[id]/route.ts
├─ components/layout/NewConversationModal.tsx  components/chat/ChatWindow.tsx
├─ messages/pt-BR.json (51 chaves groups.*)  scripts/seed-demo.ts
└─ docs/guia-supabase.md (inclui a 0005)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: no Supabase, rode a nova migration `0005_groups.sql` depois das anteriores (ordem: 0001→0005). Quem está criando do zero segue `docs/guia-supabase.md`.
2. **App**: `cd elio && npm install && npm run dev` (com o `.env.local` da Fase 1).
3. **Teste guiado**: `npm run seed` → entre como Ana e, em aba anônima, como Bruno:
   - Abra o grupo "Turma do café ☕", toque no nome → veja dados, membros e papéis.
   - Como Ana: mude o nome/descrição, gere um convite, copie o código.
   - Como Bruno (admin): adicione a Camila… ela já está lá — então entre com o código em outra conta ou remova/adiciona de volta.
   - Aba "Convite" do "+ Nova conversa": cole um código e entre no grupo.
   - Como Camila (membro): tente editar o nome (deve negar com mensagem clara).
   - Saia do grupo e confirme que ele some da sua lista.
4. **Saúde**: `npm run build`, `npm run test` (14 testes), `/api/health` → `{"ok":true}`.

## (e) Checklist de aceite

- [x] Criar grupo com nome + contatos (mínimo 1 pessoa)
- [x] Ver dados do grupo: nome, descrição, membros com papéis
- [x] Admin: editar nome/descrição, adicionar/remover, gerar convite
- [x] Dono: promover/rebaixar, transferir posse, tudo do admin
- [x] Membro comum: só conversa (gestão negada com mensagem clara)
- [x] Entrar por código de convite (aba Convite)
- [x] Sair do grupo (posse passa p/ o mais antigo; último apaga)
- [x] Mensagens de sistema para entra/sai/adiciona/remove/papéis
- [x] Bloqueio/privacidade respeitados ao montar o grupo
- [x] Lista mostra "Nome: mensagem" nos grupos
- [x] Textos em `messages/pt-BR.json`; sem fotos reais; sem promessa de "ponta a ponta"

## (f) Limitações conhecidas

1. Foto do grupo fica para a Fase 2B (junto com o pipeline de mídia): por enquanto, avatar automático de iniciais.
2. Quem entra por convite não passa por checagem de bloqueio com quem já está lá (decisão simples p/ v1; dá para apertar depois).
3. Sem "pedir para entrar" (convite é entrada direta) e sem limite configurável (fixo em 200).
4. Removido/saído não recebe aviso especial além da mensagem de sistema no grupo.
5. E2E cobre só as páginas públicas (fluxo autenticado depende do Supabase do usuário).

## Suposições registradas (Fase 2A)

Grupo nasce com ao menos 1 outra pessoa; só o dono mexe em papéis; posse do dono que sai vai para o membro mais antigo; entrar por convite ignora bloqueio; foto do grupo adiada para 2B; teto de 200 membros.
