create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null check (status in ('lobby', 'in_game', 'finished')),
  host_player uuid not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null,
  avatar text not null default 'P',
  seat_index int not null,
  is_bot boolean not null default false,
  connected boolean not null default true,
  last_seen timestamptz not null default now(),
  unique (room_id, seat_index)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  state jsonb not null,
  version int not null default 0,
  turn_player uuid not null,
  phase text not null,
  updated_at timestamptz not null default now(),
  unique (room_id)
);

create table if not exists public.moves (
  id bigserial primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  version int not null,
  player_id uuid not null,
  move jsonb not null,
  events jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.moves enable row level security;

drop policy if exists "rooms are visible" on public.rooms;
create policy "rooms are visible"
on public.rooms for select
to anon, authenticated
using (true);

drop policy if exists "players are visible" on public.players;
create policy "players are visible"
on public.players for select
to anon, authenticated
using (true);

drop policy if exists "moves are visible" on public.moves;
create policy "moves are visible"
on public.moves for select
to anon, authenticated
using (true);

-- Canonical state is intentionally not readable by browser clients.
-- Server Actions use SUPABASE_SERVICE_ROLE_KEY and return redactStateFor(...) instead.
drop policy if exists "games are server only" on public.games;
create policy "games are server only"
on public.games for all
to service_role
using (true)
with check (true);

drop policy if exists "rooms service writes" on public.rooms;
create policy "rooms service writes"
on public.rooms for all
to service_role
using (true)
with check (true);

drop policy if exists "players service writes" on public.players;
create policy "players service writes"
on public.players for all
to service_role
using (true)
with check (true);

drop policy if exists "moves service writes" on public.moves;
create policy "moves service writes"
on public.moves for all
to service_role
using (true)
with check (true);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists players_room_idx on public.players(room_id);
create index if not exists games_room_idx on public.games(room_id);
create index if not exists moves_game_version_idx on public.moves(game_id, version);
