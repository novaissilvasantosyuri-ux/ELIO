# ELIO — Fase 2B: Mídia e recursos de mensagem (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (SMOKE-SQL-OK + SMOKE-2A-OK + SMOKE-2B-OK) · 18 testes unitários · build 49 rotas · E2E 1/1.

## (a) Resumo do que foi feito

- **Banco (migration 0006)**: tabelas `attachments` e `message_reactions`; colunas `forwarded`, `pinned_at/by` e `filename`; tipo `video` próprio; bucket privado `chat-media` (sem policies = só a service role); RLS de leitura para membros; 7 RPCs — `send_media`, `toggle_reaction`, `edit_message`, `forward_message`, `pin_message`, `get_pinned` (+ `can_see_message`); histórico agora traz reações, anexos (sem expor caminho) e flags; reações entram na publication realtime.
- **Mídia**: envio de foto (comprimida no cliente, máx. 1600px WebP), vídeo (50 MB), áudio/voz (gravador com MediaRecorder) e documentos (lista fechada: PDF, texto, Office, zip…; nada executável, nada SVG/HTML); tudo validado de novo no servidor (mime, tamanho, membro, bloqueio, privacidade); download por URL assinada de 60 s (documento baixa como anexo; foto/vídeo/áudio abrem na tela); apagar-para-todos remove o arquivo junto; prévia com legenda antes de enviar.
- **Foto do grupo**: admins enviam (recorte quadrado automático 512px), servida por rota autenticada com URL assinada.
- **Reações**: 12 emojis rápidos, contadores ao vivo via realtime (sem recarregar), toque alterna.
- **Editar**: texto próprio até 30 min, edição inline no balão, marca "editada".
- **Encaminhar**: texto ou mídia (reaproveita o arquivo, sem copiar bytes), cópia marcada "↪ Encaminhada", mesma validação de bloqueio/privacidade do envio.
- **Fixar**: qualquer membro fixa/desafixa; barra de fixadas com navegação ‹ › e pulo até a mensagem.
- **Lista de conversas**: prévia mostra 📷/🎬/🎙️/📎 + legenda.
- **Seed demo**: reação ❤️ + mensagem fixada no grupo do café.
- **Ferramenta**: `scripts/run-sql.py` (corredor SQL versionado no repo).

## (b) Arquivos novos/alterados

```
Novos:
├─ supabase/migrations/0006_media.sql   (tabelas, bucket, RLS, 7 RPCs, histórico estendido)
├─ tests/db/smoke2b.sql                 (fumaça 2B, ~45 asserts)
├─ scripts/run-sql.py                   (corredor SQL versionado)
├─ app/api/media/route.ts               (upload multipart → storage + send_media)
├─ app/api/attachments/[id]/route.ts    (download por URL assinada)
├─ app/api/conversations/[id]/avatar/route.ts  (upload da foto do grupo)
├─ app/api/groups/[id]/avatar/route.ts  (serve a foto do grupo)
├─ app/api/conversations/[id]/pinned/route.ts  (lista fixadas)
├─ app/api/messages/[id]/reactions/route.ts    (reagir)
├─ app/api/messages/[id]/forward/route.ts      (encaminhar)
├─ app/api/messages/[id]/pin/route.ts          (fixar)
├─ lib/media.ts + lib/media.test.ts     (compressão, crop, voz, formatos + 4 testes)
└─ components/chat/MessageParts.tsx     (anexo, reações, encaminhar, fixadas, lightbox)
Alterados:
├─ lib/supabase/types.ts (video, reactions, attachments, pinned, forwarded)
├─ lib/schemas.ts + lib/schemas.test.ts (5 schemas novos — teste segue 5/5)
├─ app/api/_helpers.ts (8 códigos de erro)  app/api/messages/[id]/route.ts (PATCH editar + limpa storage)
├─ lib/realtime.ts + lib/chat-hooks.ts (UPDATE de msg, reações ao vivo, syncLatest, pinsTick)
├─ components/chat/MessageList.tsx + Composer.tsx (reescritos com 2B)
├─ components/chat/ChatWindow.tsx (fixadas, encaminhar, reagir, editar)
├─ components/layout/ConversationList.tsx (prévia de mídia)
├─ components/ui.tsx (ícones mic/stop)  messages/pt-BR.json (chat +17, media +26)
├─ scripts/seed-demo.ts  tests/db/smoke.sql (buckets por nome)  docs/guia-supabase.md (0006)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Banco**: rode a migration `0006_media.sql` após as anteriores (ordem: 0001→0006).
2. **App**: `cd elio && npm install && npm run dev` (mesmo `.env.local`; precisa da service key para mídia — a mesma do seed).
3. **Teste guiado** (Ana + aba anônima Bruno, após `npm run seed`):
   - No chat: `+` → Foto → legenda → Enviar; veja chegar com prévia na lista (📷 …).
   - Microfone → grave → pare → Envie; ouça no player.
   - Toque ⋯ numa mensagem → Reagir ❤️ → veja o contador na outra aba na hora.
   - Edite um texto seu; tente editar um antigo (+30 min) → deve negar.
   - Encaminhe uma foto para o grupo do café → cópia marcada "Encaminhada".
   - Fixe 2 mensagens → use a barra ‹ › para navegar; desafixe.
   - No grupo (Ana): toque na câmera do avatar → foto nova no grupo.
4. **Saúde**: `npm run build`, `npm run test` (18 testes), `/api/health` → `{"ok":true}`.

## (e) Checklist de aceite

- [x] Enviar foto/vídeo/áudio/documento com legenda e prévia
- [x] Gravar e enviar mensagem de voz
- [x] Ver/baixar mídia (só membros; URL curta; documento baixa como anexo)
- [x] Foto do grupo (admin; rota autenticada)
- [x] Reagir com contadores ao vivo
- [x] Editar texto próprio (30 min, marca "editada")
- [x] Encaminhar texto e mídia (cópia marcada)
- [x] Fixar/desafixar com barra de navegação
- [x] Apagar-para-todos remove o arquivo junto
- [x] Metadados do cliente limitados no servidor (dimensões, duração, nome)
- [x] Textos em `messages/pt-BR.json`; sem fotos reais; sem "ponta a ponta"

## (f) Limitações conhecidas

1. Metadados (largura/altura/duração) vêm do cliente, só limitados no servidor (sem reprocessar bytes — decisão simples p/ v1).
2. Sem miniatura separada: a listagem usa o próprio arquivo (com dimensões reservadas contra salto de layout).
3. Mídia não entra na fila offline (só texto): sem internet, o app avisa e não envia.
4. Contadores de reação mesclam eventos ao vivo (recarregar corrige qualquer divergência rara).
5. Arquivos órfãos (falha entre upload e RPC) ficam no bucket — o código tenta limpar (melhor esforço).
6. Reações não disparam som/notificação especial; sem "quem reagiu" (só contagem + "minha").
7. E2E cobre só as páginas públicas (fluxo autenticado depende do Supabase do usuário).

## Suposições registradas (Fase 2B)

Qualquer membro fixa/desafixa; edição só texto próprio até 30 min (sem histórico de versões); encaminhar reaproveita o arquivo; foto do grupo sem editor manual (recorte central automático); limites 10/50/10/25 MB; documentos com lista fechada de mimes.
