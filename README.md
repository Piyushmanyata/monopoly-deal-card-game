# DEAL!

Original browser implementation of a Monopoly Deal-style card game. The card names and visuals are custom and avoid Hasbro/Monopoly branding.

## What is implemented

- Next.js 15 App Router, TypeScript strict, Tailwind CSS, shadcn/ui.
- Pure rules engine in `src/lib/engine`.
- Unit tests for deck composition, turn flow, payment rules, Hard No chains, rent, buildings, wildcards, and win checks.
- Playable single-player table at `/play` with 1-4 bots, local persistence, animations, sound toggle, and win confetti.
- Supabase room-code scaffolding with server-authoritative move actions and redacted state access.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npx tsc --noEmit
npm run build
```

## Multiplayer setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

4. Restart the dev server.

The canonical full game state is stored only in `games.state` and is readable through the service role from server actions. Browser clients should call `getMyView(roomId, playerId)`, which returns `redactStateFor(...)` and never exposes opponent hands or deck order.

## Notes

The spec asks to verify official card values against scanned card references before hardcoding. This build uses the provided spec values as canonical because no scanned references were present in the workspace.
