# ELIO — Fase 4: Notificações push + mensagens que somem (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (smokes 1→4, SMOKE-4-OK) · 24 testes unitários · build verde · E2E 1/1 · lint sem erros novos.

## (a) Resumo do que foi feito

- **Banco (migration 0008)**: tabela `push_subscriptions` (uma linha por aparelho, dono só vê as dele); coluna `disappear_after` nas conversas (0/24h/7 dias); 4 RPCs — `save/delete_push_subscription`, `get_push_targets` (membros menos eu e silenciados, com `preview_text` de cada um), `set_disappearing` (DM: qualquer lado; grupo/canal: admin+; oficial: não; grava aviso ⏳) — mais `purge_expired_messages` **sem grant** (só a service role chama); `get_messages`/`get_conversations` reescritos (expiradas somem do histórico, da prévia e das não-lidas; sistema nunca expira).
- **Push**: Web Push com VAPID (`web-push`); envio após texto e mídia, melhor esforço (nunca quebra o envio nem atrasa a resposta); título "Nome" na DM e "Nome · conversa" em grupo/canal; corpo some se o destinatário desligou prévia; inscrições mortas (404/410) são limpas sozinhas; rota conta com chave ausente (503 amigável).
- **Service worker**: `public/sw.js` mostra a notificação e abre/foca a conversa ao tocar.
- **App**: Configurações → Notificações ganha liga/desliga de push (com os 5 estados: ligado, desligado, bloqueado no navegador, sem suporte, servidor sem chave); menu do chat ganha "Mensagens que somem" (Desligado/24h/7 dias) com selo ⏳ no cabeçalho.
- **Expurgo**: `POST /api/cron/purge` (segredo `x-cron-secret`) apaga expiradas + remove os arquivos do storage; chame 1x/dia.

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0008_push_disappearing.sql (tabela, coluna, 5 RPCs, 2 rewrites)
├─ tests/db/smoke4.sql            (fumaça: push, timer, permissões, purge, prévia)
├─ lib/push.ts                    (envio VAPID + limpeza de mortas)
├─ lib/push-client.ts             (permissão, assinatura, estados)
├─ public/sw.js                   (mostrar push + abrir conversa)
├─ app/api/push/vapid-key/route.ts, subscribe/route.ts, unsubscribe/route.ts
├─ app/api/conversations/[id]/disappearing/route.ts
└─ app/api/cron/purge/route.ts
Alterados:
├─ app/api/messages/route.ts + app/api/media/route.ts (gancho de push)
├─ app/api/_helpers.ts (bad_timer)  lib/schemas.ts + teste (+2 testes)
├─ lib/supabase/types.ts (disappear_after)  messages/pt-BR.json (settings +7, disappear +10)
├─ components/settings/SettingsSections.tsx (liga/desliga push)
├─ components/chat/ChatWindow.tsx (menu + modal + selo ⏳)
├─ package.json (web-push)  .env.example (VAPID_* + CRON_SECRET)  docs/guia-supabase.md (0008)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: rode `0008_push_disappearing.sql` após as anteriores (ordem: 0001→0008).
2. **Chaves push** (uma vez): `npx web-push generate-vapid-keys` → ponha `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT=mailto:voce@exemplo.com` no `.env.local`; invente um `CRON_SECRET` forte.
3. **App**: `cd elio && npm install && npm run dev`.
4. **Teste guiado** (2 navegadores/abas, Ana + Bruno, após `npm run seed`):
   - Ana: Configurações → Notificações → ligue o push (aceite no navegador).
   - Bruno: mande "oi" na DM → Ana recebe a notificação mesmo com a aba em segundo plano; toque abre a conversa.
   - Ana: desligue "Prévia do texto" → Bruno manda de novo → a notificação mostra só "Nova mensagem".
   - Na DM: menu ⋯ → "Mensagens que somem" → 24 horas → aparece o aviso ⏳ + selo no topo.
   - Para ver sumindo sem esperar 24h: rode o purge com o segredo (`curl -X POST -H "x-cron-secret: SEU" localhost:3000/api/cron/purge`) após envelhecer uma mensagem no banco — ou confie no smoke4, que testa a expiração.
   - Oficial "Equipe ELIO": o menu de sumiço nem aparece.

## (e) Checklist de aceite

- [x] Ligar/desligar push com os 5 estados e mensagens claras
- [x] Push chega para texto e mídia (DM, grupo, canal)
- [x] Silenciado não recebe; prévia respeita a privacidade de cada um
- [x] Timer 24h/7d/desligado por conversa, com aviso e selo
- [x] Expiradas somem do histórico, prévia e contadores
- [x] Purge apaga do banco + limpa arquivos do storage
- [x] Permissões: membro não mexe em timer de grupo/canal; oficial bloqueado
- [x] Textos em `messages/pt-BR.json`; sem "ponta a ponta"

## (f) Limitações conhecidas

1. Push precisa de HTTPS em produção (localhost funciona) + chaves VAPID configuradas.
2. iOS só recebe push com o app instalado na tela inicial (limite da Apple).
3. O expurgo é diário: entre expirar e o purge, a mensagem some da tela mas ainda existe no banco.
4. Sem "apagar para todos com timer diferente por mensagem": o timer é da conversa.
5. Timer não impede print nem cópia antes de sumir (avise isso aos usuários).

## Suposições registradas (Fase 4)

Timer por conversa (0/24h/7d); mensagens de sistema nunca expiram; qualquer lado da DM mexe no timer; grupo/canal exigem admin+; push usa `preview_text` de cada destinatário; silenciados não recebem; purge via segredo (sem pg_cron, para rodar em qualquer plano).
