# ELIO — Fase 6: Chamadas de voz/vídeo (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (smokes 1→6, SMOKE-6-OK) · 34 testes unitários · build verde · E2E 1/1 · lint sem erros novos.

## (a) Resumo do que foi feito

- **Banco (migration 0010)**: tabela `calls` (conversa, quem liga/recebe, voz/vídeo, estado); RLS (só os dois lados leem); 4 RPCs — `start_call` (só DM, sem bloqueio, sem outra ativa, aposenta presa há +2 min), `accept_call` (só quem recebe, em até 90 s), `end_call` (cancelar/recusar/timeout/desligar com estado final correto), `get_call` (dados + peer para entrar).
- **Sinalização**: Supabase Realtime broadcast — toque em `elio:ring:{user}`, oferta/resposta/candidatos/bye em `elio:call:{id}` (tudo validado com zod; sinal estranho é ignorado); handshake `ready` (quem recebe avisa que chegou, quem liga reenvia a oferta).
- **Mídia P2P**: WebRTC direto entre aparelhos (o servidor nunca vê áudio/vídeo); STUN do Google por padrão + TURN opcional por env (via `GET /api/calls/ice`, sem vazar segredo no bundle).
- **App**: provedor global (ouve o toque em qualquer tela, toque sonoro + vibração, timeout 45 s); tela de chamada (vídeo remoto + PiP local, avatar em voz, cronômetro, mudo, liga/desliga câmera, desligar); botões 📞/🎥 do chat ligando de verdade na DM (grupo/canal avisam "só 1-a-1 em v1").

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0010_calls.sql (tabela, RLS, 4 RPCs)
├─ tests/db/smoke6.sql                (fluxo, recusa, timeout, grupo, bloqueio)
├─ lib/calls.ts + lib/calls.test.ts   (fases, ICE, schemas de sinal + 4 testes)
├─ components/calls/CallProvider.tsx  (toque global, fases, API, timeouts)
├─ components/calls/CallView.tsx      (WebRTC + tela)
├─ app/api/calls/route.ts             (iniciar)
├─ app/api/calls/ice/route.ts         (servidores ICE)
├─ app/api/calls/[id]/accept/route.ts (atender)
└─ app/api/calls/[id]/end/route.ts    (encerrar)
Alterados:
├─ app/api/_helpers.ts (not_direct/busy/expired)  lib/schemas.ts + teste (+2 testes)
├─ components/layout/AppShell.tsx (monta CallProvider)
├─ components/chat/ChatWindow.tsx (botões reais)  messages/pt-BR.json (calls +17)
├─ docs/guia-supabase.md (0010)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: rode `0010_calls.sql` após as anteriores (ordem: 0001→0010).
2. **TURN (opcional, mas recomendado)**: sem TURN, chamadas entre redes diferentes (4G ↔ Wi-Fi) podem falhar. Use um TURN gratuito/de teste ou próprio e preencha `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` no `.env.local` (nomes do `.env.example`).
3. **App**: `cd elio && npm install && npm run dev`. **Atenção**: câmera/mic exigem HTTPS ou `localhost` — teste com 2 abas em `localhost` ou com o deploy https.
4. **Teste guiado** (Ana no Chrome + Bruno em aba anônima, após `npm run seed`):
   - Na DM, Ana toca 📞 → Bruno ouve o toque e vê a tela de "Chamada recebida" → Atender → conversam (teste Mudo).
   - Desligue de um lado → some dos dois lados.
   - Ana liga e Bruno recusa → Ana vê "Não atendeu".
   - Ana liga e ninguém atende por 45 s → vira "não atendida" dos dois lados.
   - Tente ligar de um grupo → aviso "só 1-a-1 em v1".

## (e) Checklist de aceite

- [x] Ligar/atender/recusar/desligar voz e vídeo na DM
- [x] Toque global (funciona fora do chat) com som + vibração
- [x] Timeout 45 s com "não atendida"; ocupado impede 2ª chamada
- [x] Bloqueio impede; grupo/canal/estranho barrados
- [x] Mudo + câmera; cronômetro; telas de erro claras (mic, conexão)
- [x] TURN configurável sem expor segredo no front
- [x] Textos em `messages/pt-BR.json`; sem "ponta a ponta"

## (f) Limitações conhecidas

1. Só 1-a-1 em v1 (sem chamada em grupo nem transferência).
2. Sem TURN, redes restritas (4G/firewall) podem não conectar — o app avisa "não foi possível conectar".
3. Precisa HTTPS em produção (exigência do navegador p/ câmera/mic).
4. Sem histórico de chamadas nem "retornar chamada" (a DM continua normal).
5. Compartilhar tela não entra em v1.

## Suposições registradas (Fase 6)

P2P puro (servidor só valida/estado); timeout 45 s no cliente + 90 s/2 min no servidor; STUN Google padrão; TURN só via env; toque só toca com o app aberto/logado (sem push de chamada em v1 — o push de mensagem da Fase 4 não acorda chamada).
