# ELIO — Fase 1: Núcleo (entrega)

> Status: **implementado, testado e com build passando** ✅
> Stack: Next.js 16 + React 19 + TypeScript estrito + Supabase + Tailwind v4 + zod.

## (a) Resumo do que foi feito

- **Projeto rodando**: 39 rotas (telas + API), build de produção passando, teste de fumaça E2E passando.
- **Design system e layout**: tokens em CSS, temas claro/escuro/automático sem "piscar", 3 colunas no desktop (1100+), 2 no tablet (700–1099, menu só ícones), 1 no celular + barra inferior, chat em tela cheia com voltar, `dvh` + `visualViewport` contra o teclado.
- **Conta**: cadastro (e-mail, senha, @ único com validação em tempo real, nome), login, logout, recuperar senha, verificar e-mail, aceite de Termos/Privacidade (textos-modelo editáveis no banco) + idade mínima configurável.
- **Onboarding** guiado e pulável (perfil, aparência, notificações, tour, privacidade).
- **Meu Perfil completo**: foto (arquivo/câmera, recorte circular com zoom, 512px WebP sem EXIF, ≤5 MB, remover), nome, @ (3 trocas/30 dias), bio, status (texto+emoji), cor de destaque, banner (cor/imagem), presença, "ver como os outros me veem", cartão de outras pessoas com ações.
- **Contatos/bloqueio/silêncio**: solicitar por @, aceitar/recusar/cancelar, remover, bloquear (servidor, sem avisar, some a DM + some o perfil), silenciar pessoa (1h/8h/1sem/sempre) e por conversa.
- **Conversas 1-a-1 em tempo real**: envio otimista, fila offline (IndexedDB) com reenvio idempotente, histórico paginado com rolagem infinita (mantém posição), "ir para a mais recente", ✓/✓✓/lido (azul), "digitando...", não lidas + divisor, recibos desligáveis (2 sentidos), responder, apagar p/ mim e p/ todos, copiar, fixar/arquivar/não-lida/silenciar/apagar, busca na lista e dentro da conversa, emoji, links seguros, mensagens de sistema.
- **Equipe ELIO** oficial somente leitura com boas-vindas, criada no cadastro.
- **Chamadas e Elio IA visíveis com "Em breve"** (Comunidades e Explorar idem, via flags).
- **Segurança desde a Fase 1**: RLS em tudo + RPCs validados, anti-IDOR, zod, rate limit, respostas genéricas, CSP/HSTS/nosniff, sem innerHTML, segredos só em env.
- **Testes**: 9 unitários (Vitest) + fumaça E2E (Playwright) + fumaça SQL (Postgres real, ~30 asserts).

## (b) Árvore de arquivos (código-fonte, sem build)

```
elio/
├─ proxy.ts  next.config.ts  tsconfig + eslint + prettier + vitest + playwright
├─ .env.example  package.json  README.md
├─ app/
│  ├─ layout.tsx  page.tsx (capa)  globals.css  manifest.ts
│  ├─ icons/ (PWA 192/512/maskable gerados)  auth/callback/  legal/[kind]/  onboarding/
│  ├─ (auth)/ login register forgot reset verify
│  ├─ (app)/ layout (guarda)  conversas/ contatos/ perfil/ config/ comunidades*/ explorar*
│  └─ api/ health username profile settings onboarding presence(+peers)
│         conversations(+[id]) messages(+[id],search) receipts contacts(+4) blocks mutes
│         users/[username] legal
├─ components/ ui brand providers layout(4) chat(4) profile(3) contacts settings(2)
│              onboarding legal
├─ lib/ supabase(4+types) realtime chat-hooks offline hooks images i18n features
│       security schemas utils(+testes)
├─ messages/pt-BR.json  public/(logo,icon,favicon).svg  scripts/seed-demo.ts
├─ supabase/migrations/ 0001_schema 0002_functions 0003_rls 0004_triggers_storage_seed
├─ tests/ db(stubs,smoke) e2e(smoke)
└─ docs/ guia-supabase.md fase-1-entrega.md shots/
```

## (c) Código

Todo o código está nos arquivos do projeto (esta fase teve ~90 arquivos; o conteúdo completo está no workspace, sem resumos). Para rodar, siga o item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Pré-requisitos**: Node 22+ (mínimo 20.9) instalado.
2. **Banco**: siga `docs/guia-supabase.md` (criar projeto → rodar as 4 migrations na ordem → pegar as 3 chaves → configurar redirects de login).
3. **App**:
   ```bash
   cd elio
   npm install
   cp .env.example .env.local   # preencha as chaves
   npm run dev                  # http://localhost:3000
   ```
4. **Teste guiado (2 janelas = 2 usuários)**:
   - `npm run seed` → entre com `ana.demo@elio.exemplo` / `Demo1234!` e, em aba anônima, `bruno.demo@elio.exemplo` / `Demo1234!`.
   - Envie mensagens e veja chegar na hora, com ✓ → ✓✓ → azul; digite e veja o "digitando...".
   - Teste: responder, apagar p/ mim e p/ todos, fixar, arquivar, silenciar, busca, temas, papel de parede, trocar foto com recorte, bloquear (a DM some) e desbloquear.
   - Desligue a internet, envie (entra na fila), religue (envia sozinho, sem duplicar).
5. **Saúde**: `npm run build`, `npm run test`, `/api/health` → `{"ok":true}`.

## (e) Checklist de aceite

- [x] Projeto roda (`dev` + `build`) e abre sem Supabase (aviso amigável, nunca tela branca)
- [x] Layout 3/2/1 colunas + estados vazio/skeleton/erro/offline
- [x] Cadastro, login, logout, recuperar, verificar, termos + idade
- [x] Onboarding completo e pulável
- [x] Perfil completo (foto com recorte, @ com limite, bio, status, cor, banner, presença, prévia)
- [x] Contatos, bloqueio (servidor) e silêncio (pessoa e conversa)
- [x] Chat 1-a-1: realtime, histórico paginado, status, digitação, não lidas, responder, apagar, busca
- [x] Temas (claro/escuro/auto), fonte P/M/G, densidade, menos animação, wallpaper global + por conversa
- [x] Equipe ELIO oficial; chamadas e Elio IA marcados "Em breve"
- [x] Textos em `messages/pt-BR.json`; flags em `.env`
- [x] Testes unit + E2E fumaça + SQL fumaça passando

## (f) Limitações conhecidas

1. Imagens de referência não foram anexadas: identidade segue a paleta/descrição do briefing.
2. Fluxo autenticado completo (2 usuários conversando) depende do Supabase do usuário — validado aqui: build, E2E público, SQL funcional e prints.
3. Editar mensagem e reações ficam para a Fase 2 (conforme o escopo).
4. Lista virtualizada e E2E dos fluxos críticos ficam para a Fase 7.
5. Avatares/banners/wallpapers ficam em buckets públicos com nomes aleatórios (urls não listáveis); mídia de chat (Fase 2) será privada com URL assinada.
6. "Digitando..." usa Broadcast por conversa (só IDs opacos); conteúdo sempre via canais com RLS.
7. Push, service worker, 2FA, sessões, export/exclusão, grupos, comunidades, IA e chamadas: fases 2–6.

## Ajustes em relação à Fase 0 (registrados)

Paginação por cursor `(created_at, id)` (sem `seq`); presença via `last_seen_at` + canal de perfis com refetch filtrado no servidor; tabelas da Fase 2+ criadas nas próprias fases; `notification_prefs` incorporado a `user_settings` na Fase 1; crop de avatar feito à mão (sem lib externa).
