# ELIO — Fase 7: Acabamento (entrega)

> Status: **implementado, testado e com build passando** ✅
> Validação: Postgres real (smokes 1→6, ALL-SQL-OK) · 34 testes unitários · build verde · E2E 3/3 · lint sem erros novos.

## (a) Resumo do que foi feito

- **E2E de verdade**: novo `tests/e2e/gates.spec.ts` — deslogado cai no `/login` (páginas), API sem sessão nega com 401 (conversas, comunidades, canais, IA, chamadas, push) e o purge sem segredo nega com 403. Roda sem Supabase (usa o servidor de produção local). Total: 3/3 com o smoke original.
- **Performance**: `content-visibility: auto` nas linhas de mensagem e de conversa (listas longas rolam sem engasgar) + `.mirror` (prévia local da chamada espelhada).
- **Docs finais**: README com o mapa real (todas as fases ✅ + nota sobre a ordem executada); `guia-supabase.md` até a 0010 + checklist de produção (VAPID, cron de purge, Gemini, TURN, redirect URLs, SMTP, comandos de validação).
- **Revisão geral**: tipos limpos, 34 unitários, build verde, lint em paridade (só padrões pré-existentes), sem texto fora do `pt-BR.json` nas telas novas.

## (b) Arquivos novos/alterados

```
Novos:
├─ tests/e2e/gates.spec.ts (portões: redirect + 401 + 403)
└─ docs/fase-7-entrega.md (este arquivo)
Alterados:
├─ app/globals.css (cv-row + mirror)
├─ components/chat/MessageList.tsx + layout/ConversationList.tsx (cv-row)
├─ README.md (mapa final)  docs/guia-supabase.md (0010 + produção)
```

## (c) Código

Todo o código está completo no projeto em `/home/user/elio`. Para rodar: item (d).

## (d) Passo a passo para rodar e testar (iniciante)

1. **Tudo de uma vez**: `cd elio && npm install && npm test && npm run build`.
2. **E2E**: `npx playwright test` (sobe o servidor sozinho; se o navegador reclamar de libs no Linux, rode com `LD_LIBRARY_PATH=/tmp/syslibs/root/usr/lib/x86_64-linux-gnu` após o truque do `apt-get download` documentado na Fase 2B).
3. **Banco completo**: `python3 scripts/run-sql.py tests/db/stubs.sql supabase/migrations/*.sql tests/db/smoke*.sql` (precisa de Postgres local + `pip install pglast "psycopg[binary]"`).
4. **Produção**: siga o checklist no final do `guia-supabase.md`.

## (e) Checklist de aceite

- [x] E2E cobre portões sem precisar de Supabase (3/3)
- [x] Listas longas com render otimizado
- [x] README + guia prontos para outra pessoa instalar
- [x] Checklist de produção (push, purge, IA, TURN)
- [x] Validação total verde (SQL, unitários, build, E2E, lint)

## (f) Limitações conhecidas (do projeto inteiro)

1. E2E não cobre fluxos logados (exigiriam Supabase de teste com seed).
2. Sem virtualização total da lista (usa `content-visibility`, suficiente até milhares de linhas).
3. Push/iOS, TURN e cotas do Gemini seguem as limitações das Fases 4–6.
4. Auditoria (`audit_log`) existe mas sem tela de consulta (só banco).

## Suposições registradas (Fase 7)

Portões via teste sem backend (redirect + status HTTP); `content-visibility` em vez de lib de virtualização (zero dependência, risco zero); docs como fonte de instalação (sem instalador automático).
