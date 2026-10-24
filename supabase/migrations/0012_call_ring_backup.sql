-- ELIO — 0012: toque de chamada garantido.
-- Publica a tabela calls no Realtime: quem recebe assina o INSERT e toca
-- mesmo se o broadcast rápido se perder. O RLS ("calls party read") garante
-- que cada um só recebe as próprias chamadas. Sem payload especial: o app
-- busca os detalhes via GET /api/calls/pending.

alter publication supabase_realtime add table public.calls;
