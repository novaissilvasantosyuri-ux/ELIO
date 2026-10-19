# Guia Supabase (do zero, passo a passo)

> Tempo estimado: 15–20 minutos. Você só precisa de um navegador.

## 1. Criar a conta e o projeto

1. Acesse [supabase.com](https://supabase.com) → **Start your project** → entre com GitHub ou e-mail.
2. **New project** → dê o nome `elio` → crie uma senha forte do banco (guarde!) → escolha a região **South America (São Paulo)** → **Create new project**.
3. Aguarde ~2 minutos até o painel abrir.

## 2. Rodar as migrations (cria tabelas, regras e seeds)

1. No menu lateral, abra o **SQL Editor** → **New query**.
2. Abra aqui no repo o arquivo `supabase/migrations/0001_schema.sql`, copie **todo** o conteúdo, cole no editor e clique **Run** (ou Ctrl+Enter). Espere o "Success".
3. Repita para `0002_functions.sql`, `0003_rls.sql`, `0004_triggers_storage_seed.sql`, `0005_groups.sql`, `0006_media.sql`, `0007_communities.sql`, `0008_push_disappearing.sql`, `0009_elio_ia.sql` e `0010_calls.sql`, **nesta ordem**.
4. Conferência rápida: menu **Table Editor** → você deve ver `profiles`, `messages`, `conversations`, `communities`, `calls` etc. Em **Storage**, os buckets `avatars`, `banners`, `wallpapers`, `chat-media` (privado) e `community-avatars`.

## 3. Pegar as chaves e configurar o app

1. Vá em **Project Settings** (engrenagem) → **API**.
2. Copie: **Project URL**, **anon public key** e **service_role key** (esta última é secreta!).
3. No repo, copie `.env.example` para `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `NEXT_PUBLIC_APP_URL` = `http://localhost:3000`

## 4. Configurar o login por e-mail

1. No Supabase, abra **Authentication** → **Sign In / Up**.
2. Em **Auth Providers**, deixe **Email** ativado.
3. Para testar rápido (sem confirmar e-mail): **Authentication** → **Settings** (ou **Emails**) → desligue **Confirm email**. Para produção, deixe ligado.
4. Em **URL Configuration**: **Site URL** = `http://localhost:3000`; em **Redirect URLs**, adicione:
   - `http://localhost:3000/auth/callback`
   - depois, a URL de produção (ex.: `https://seu-app.vercel.app/auth/callback`)

## 5. Rodar o app

```bash
cd elio
npm install
npm run dev
```

Abra `http://localhost:3000` → **Criar conta** → faça o onboarding → converse!

## 6. Dados de demonstração (opcional)

Com o `.env.local` pronto:

```bash
npm run seed
```

Cria 3 usuários fictícios (`ana.demo@elio.exemplo`, `bruno.demo@elio.exemplo`, `camila.demo@elio.exemplo`, senha `Demo1234!`) com conversas de exemplo. Dica: entre com dois deles em navegadores diferentes (ou uma aba anônima) para ver o tempo real funcionando.

## 7. Conferir se está tudo certo

- `http://localhost:3000/api/health` deve responder `{"ok":true,...}`.
- Criar conta gera a conversa **Equipe ELIO** com o "Bem-vindo(a)! 🎉".
- Enviar mensagem entre dois usuários aparece na hora, com ✓ → ✓✓.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Aviso "Falta configurar o Supabase" | `.env.local` ausente/errado | Confira nomes e valores, reinicie o `npm run dev` |
| Erro ao criar conta | "Confirm email" ligado e e-mail não chegou | Veja spam; ou desligue p/ testar (§4.3) |
| Mensagem não chega ao outro | Migration 0003 não rodada (realtime) | Rode as 10 migrations na ordem |
| Upload de foto falha | Buckets não criados | Rode a migration 0004 (cria os buckets) |
| "relation does not exist" | Migração fora de ordem | Rode 0001→0010 em sequência limpa |

## Produção (checklist da Fase 7)

1. Suba o código no GitHub → importe na [Vercel](https://vercel.com) → cadastre **todas** as envs do `.env.example` (Supabase + `VAPID_*`, `CRON_SECRET`, `GEMINI_API_KEY`, `TURN_*`).
2. No Supabase, adicione a URL de produção nos **Redirect URLs** (§4.4).
3. Reative **Confirm email** e, se quiser, configure SMTP próprio.
4. **Push**: gere as chaves VAPID (`npx web-push generate-vapid-keys`) e cadastre; push exige HTTPS (a Vercel já dá).
5. **Expurgo**: agende `POST https://seu-app/api/cron/purge` 1x/dia com header `x-cron-secret` (Vercel Cron ou o agendador do Supabase).
6. **IA**: crie a chave gratuita no [Google AI Studio](https://aistudio.google.com) e cadastre `GEMINI_API_KEY` (acompanhe a cota no painel do Google).
7. **Chamadas**: cadastre um TURN (`TURN_URL/USERNAME/CREDENTIAL`) para redes móveis/firewall funcionarem.
8. Rode `npx tsc --noEmit`, `npm test` e `npm run build` antes de cada deploy.
