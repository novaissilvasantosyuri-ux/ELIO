# ELIO — Fase 5: Elio IA (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (smokes 1→5, SMOKE-5-OK) · 28 testes unitários · build verde · E2E 1/1 · lint sem erros novos.

## (a) Resumo do que foi feito

- **Banco (migration 0009)**: tipo de conversa `'ai'`; coluna `messages.is_ai`; RPC `get_or_create_ai_chat` (um chat solo por pessoa, nasce com saudação); RPC `ai_reply` (só no próprio chat `ai`, texto 1..4000); `get_messages` reescrito (+ `is_ai`, nome "Elio IA").
- **Provedor**: Google Gemini via REST (sem SDK), modelo por env (`AI_MODEL`, padrão `gemini-2.5-flash`); system prompt em pt-BR (curta, simples, honesta; nunca finge ser humana); contexto = últimas 20 trocas de texto; 1024 tokens, 30 s de timeout; limite diário por env (`AI_DAILY_LIMIT`, padrão 30) + rate limit/taça por minuto; se o provedor falha, a conversa recebe fallback amigável (nunca fica sem resposta).
- **API**: `GET /api/ia/chat` (abrir/criar) e `POST /api/ia { text, client_id }` (perguntar; `client_id` casa com o realtime).
- **App**: botão "Elio IA" no topo da lista abre o chat de verdade (sem "Em breve"); chat com avatar ✦, legenda própria e composer só-texto (sem anexo/mic); respostas em bolha normal à esquerda com avatar ✦; offline avisa que IA precisa de internet.

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0009_elio_ia.sql (tipo ai, is_ai, 2 RPCs, rewrite)
├─ tests/db/smoke5.sql                  (idempotência, resposta, limites)
├─ lib/ia.ts + lib/ia.test.ts           (prompt, turnos, fallback + 4 testes)
├─ app/api/ia/chat/route.ts             (abrir/criar)
└─ app/api/ia/route.ts                  (perguntar: limite, Gemini, resposta)
Alterados:
├─ lib/schemas.ts (iaChatSchema)  lib/supabase/types.ts (ai + is_ai)
├─ lib/chat-hooks.ts (sendAi sem fila offline)  messages/pt-BR.json (ia +3)
├─ components/layout/ConversationList.tsx (botão real + avatar ai)
├─ components/chat/ChatWindow.tsx (sendAi, avatar, legenda, sem botões de chamada)
├─ components/chat/MessageList.tsx (bolha da IA)  components/chat/Composer.tsx (noMedia)
├─ docs/guia-supabase.md (0009)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: rode `0009_elio_ia.sql` após as anteriores (ordem: 0001→0009).
2. **Chave**: crie uma chave gratuita em [Google AI Studio](https://aistudio.google.com) → `GEMINI_API_KEY=sua-chave` no `.env.local` (opcionais: `AI_MODEL`, `AI_DAILY_LIMIT`).
3. **App**: `cd elio && npm install && npm run dev`.
4. **Teste guiado** (após `npm run seed`):
   - Na lista, toque "Elio IA" → abre o chat com a saudação 🤖.
   - Pergunte "escreva um convite de aniversário" → a resposta chega em bolha à esquerda.
   - Pergunte "resuma o que você acabou de escrever" → ela usa o contexto.
   - Sem chave no `.env`: o envio explica "IA ainda não configurada" (sem quebrar).
   - Fique offline e pergunte → aviso amigável (IA precisa de internet).

## (e) Checklist de aceite

- [x] Um chat solo por pessoa, com saudação
- [x] Perguntar e receber resposta com contexto
- [x] Limite diário + por minuto com avisos claros
- [x] Fallback quando o provedor falha; erro claro sem chave
- [x] Bolhas da IA à esquerda com avatar; composer só-texto
- [x] Textos em `messages/pt-BR.json`; sem "ponta a ponta"

## (f) Limitações conhecidas

1. Precisa de `GEMINI_API_KEY` (gratuita no AI Studio, com cotas do Google).
2. Sem streaming: a resposta chega de uma vez (pode levar alguns segundos).
3. A IA só lê texto (fotos/áudio no chat são ignorados; o composer nem oferece).
4. O limite conta perguntas, não tokens; cada aparelho/logado tem sua cota.
5. Respostas podem errar — o prompt pede honestidade, mas confira o importante.

## Suposições registradas (Fase 5)

Gemini como provedor (nomes de env do `.env.example` honrados); chat solo tipo `ai` (não grupo); `ai_reply` via RPC autenticado (forjar texto só afeta o próprio chat); 20 turnos de contexto; 1024 tokens; fallback salva bolha em vez de erro seco.
