-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It makes the one table the arcade server saves its accounts in.
create table if not exists public.arcade_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row level security on with no policies: nobody using the public (anon) key can read or write it.
-- Only the server, holding the secret service key, can.
alter table public.arcade_state enable row level security;
