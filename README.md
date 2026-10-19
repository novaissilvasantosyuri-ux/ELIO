# elio — Perto de quem importa 💜

App de conversas em tempo real, privado, moderno e personalizável.
**Fase 1 (núcleo):** conta, onboarding, perfil, contatos, bloqueio/silêncio, conversas 1-a-1 em tempo real, temas e papel de parede.

## Começando (5 minutos)

**Você precisa de:** Node 22+ (recomendado; mínimo 20.9) e uma conta grátis no Supabase.

```bash
cd elio
npm install
cp .env.example .env.local   # depois preencha (veja abaixo)
npm run dev                  # abre http://localhost:3000
```

**Configurar o banco:** siga o [Guia Supabase](docs/guia-supabase.md) — criar projeto → rodar as 4 migrations → colar as chaves no `.env.local` → configurar os redirects de login.

**Testar o tempo real:** `npm run seed` cria usuários demo; entre com dois deles em janelas diferentes e converse.

## Scripts

| Comando | Para quê |
|---|---|
| `npm run dev` | ambiente de desenvolvimento |
| `npm run build` / `npm run start` | build de produção / rodar produção local |
| `npm run lint` / `npm run format` | lint / formatação |
| `npm run typecheck` | checagem TypeScript |
| `npm run test` | testes unitários (Vitest) |
| `npm run test:e2e` | fumaça ponta a ponta (Playwright; precisa de `npx playwright install` 1x) |
| `npm run seed` | dados demo fictícios |

## Estrutura

```
app/            rotas (telas) + API (/api)
  (auth)/       login, cadastro, recuperar, verificar
  (app)/        conversas, contatos, perfil, config, comunidades*, explorar*
  onboarding/   tour guiado        (* = "Em breve")
  api/          conversas, mensagens, recibos, contatos, bloqueios, perfil...
components/     ui (design system), brand, layout, chat, profile, contacts, settings...
lib/            supabase, realtime, chat-hooks, offline (fila), segurança, utils
messages/       textos em pt-BR (i18n)
supabase/       migrations SQL (ordem!) + seed via script
public/         logo e ícones em SVG (gerados) · testes em tests/
```

## Segurança (desde a Fase 1)

- RLS em todas as tabelas + RPCs com checagem de membro/bloqueio/privacidade.
- Validação zod no servidor, rate limit, respostas genéricas no login.
- Cabeçalhos: CSP, HSTS (prod), nosniff, referrer e permissions mínimas.
- Sem `dangerouslySetInnerHTML`; links com `rel="noopener noreferrer"`.
- Segredos só em env (`service_role` jamais no cliente).

## Status das fases

- [x] Fase 0 — planejamento
- [x] Fase 1 — núcleo (conta, contatos, chat 1-a-1, temas)
- [x] Fase 2A — grupos · [x] Fase 2B — mídia e recursos de mensagem
- [x] Fase 3 — comunidades e canais
- [x] Fase 4 — notificações push + mensagens que somem
- [x] Fase 5 — Elio IA · [x] Fase 6 — chamadas de voz/vídeo · [x] Fase 7 — acabamento

> Detalhes de cada entrega em `docs/fase-*-entrega.md`. Para instalar: `docs/guia-supabase.md`.
> Nota: a ordem executada mudou um pouco em relação ao plano inicial (grupos/comunidades vieram antes de IA/chamadas); o escopo total foi cumprido.
