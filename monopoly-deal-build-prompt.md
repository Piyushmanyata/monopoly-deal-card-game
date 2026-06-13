# BUILD SPEC / AGENT PROMPT — "DEAL!" (Monopoly Deal Browser Game)

You are an expert full-stack engineer. Build a polished, production-quality browser implementation of the **Monopoly Deal** card game, deployable on Vercel, supporting **single-player vs bots** and **online multiplayer via room codes**. Treat this document as the authoritative spec. Where the spec says "verify against a reference," confirm card face values against scanned card images before hardcoding. Do not invent rules; the rules below are the complete ruleset to implement.

> **IP note:** Use original naming/branding ("DEAL!" or similar) and original card art. Do **not** reproduce Hasbro/Monopoly trademarks, logos, or copyrighted card art. The mechanics are not copyrightable; the presentation must be your own.

---

## 0. NON-NEGOTIABLE OUTCOMES (acceptance criteria)

The build is done when ALL of these are true:

1. I can open the deployed Vercel URL, click **Play vs Bots**, and complete a full game against 1–4 bots that play legally and competently.
2. I can click **Create Room**, get a short shareable room code, and a friend on a different device/network can **Join Room** with that code and we play a synchronized real-time game.
3. Hidden information is never leaked: at no point can any client (via network tab, console, or React state) see another player's hand or the deck order.
4. Every rule in §3 is correctly enforced server-side (multiplayer) and in-engine (single-player), including Just Say No chains, "no change given," partial payment, and wildcard reassignment.
5. The UI is genuinely beautiful, fluid at 60fps, fully responsive (mobile + desktop), with card animations, sound, and a confetti win sequence.
6. Disconnect/reconnect works: a player can refresh or drop and rejoin the same game and resume from current state.
7. The pure game engine has unit tests covering every action card and edge case in §3 and §10.

---

## 1. TECH STACK (use this exact stack)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router)** + TypeScript (strict) | Vercel-native, server actions for authoritative moves |
| Styling | **Tailwind CSS** + **shadcn/ui** | Fast, consistent, matches existing toolchain |
| Animation | **Framer Motion** (layout + gesture) + **canvas-confetti** | `layoutId` shared-element card flight; confetti for wins |
| Realtime + DB | **Supabase** (Postgres + Realtime Broadcast/Presence + RLS) | No WebSocket server to host; works within Vercel serverless limits |
| State (client) | **Zustand** | Lightweight store for local/animation state |
| Sound | **Howler.js** | Reliable sprite-based SFX |
| Drag/drop | **@dnd-kit** | Accessible drag for "play card to bank/property/center" |
| Deploy | **Vercel** | Per requirement |
| Testing | **Vitest** (engine unit tests) + **Playwright** (E2E happy paths) | Engine correctness is critical |

**Hard constraint:** Do not use a long-lived custom WebSocket/Socket.io server (incompatible with Vercel serverless). All realtime goes through Supabase Realtime channels.

---

## 2. ARCHITECTURE — THE CORE PATTERN

### 2.1 One pure engine, two runtimes
Write the entire ruleset as a **framework-agnostic, side-effect-free TypeScript module** in `/lib/engine`. It must not import React, Supabase, or Next. Its public surface:

```ts
// All functions are pure. State in -> new state out. No mutation, no I/O.
createInitialState(config: GameConfig): GameState
getLegalMoves(state: GameState, playerId: string): Move[]
applyMove(state: GameState, move: Move): { state: GameState; events: GameEvent[] }
redactStateFor(state: GameState, playerId: string): RedactedState  // strips other hands + deck order
isGameOver(state: GameState): { over: boolean; winnerId?: string }
serialize/deserialize(state)                                       // for DB persistence
```

- **Single-player runtime:** the engine runs entirely in the browser. Bots and the human both call `applyMove`. No server round-trips. Fast, offline-capable.
- **Multiplayer runtime:** the engine runs **only on the server** (Next.js Server Action / Route Handler). Clients send a `Move`; the server loads canonical state from Postgres, validates it is (a) that player's turn or a legal interrupt, (b) a member of `getLegalMoves`, applies it, persists, then notifies clients to refetch their **redacted** view. Clients never run `applyMove` in multiplayer.

This gives identical rules in both modes with zero duplication. **Bots use `getLegalMoves` + a heuristic scorer** (see §7), so the same bot code works in both runtimes.

### 2.2 Server authority + redaction (anti-cheat)
- Canonical `GameState` (full deck order, every hand) lives in Postgres, readable only by the server (via service role in the Server Action) — **never** sent to clients in full.
- Clients receive `RedactedState`: their own hand, all public tableaus (bank + properties of every player, face-up), counts only for opponents' hands and the draw pile, the discard pile top, current turn, action log, and any pending interaction (e.g. "you owe $5M — choose payment").
- Realtime is used as a **signal**, not a state transport: broadcast a lightweight `{ type: 'state_changed', version }` event; each client then calls a server function `getMyView(roomId)` that returns its redacted state. (Alternatively store per-player redacted snapshots; the signal+refetch approach is simpler and safe.)

### 2.3 Move/interaction model
Many actions require a **response from another player** (Just Say No, choosing how to pay). Model the game as a small state machine with a `pendingInteraction` field:

```ts
type Phase = 'draw' | 'play' | 'discard' | 'awaiting_response' | 'game_over'
type PendingInteraction =
  | { kind: 'payment'; debtorId; creditorId; amount; reason }       // debtor selects cards to pay
  | { kind: 'just_say_no'; targetId; sourceMove; jsnChain: string[] } // target may cancel
  | { kind: 'choose_property'; ... }                                  // for Sly/Forced Deal targeting
```

The current player's turn does not advance until pending interactions resolve. The server must enforce that only the player who owns a `pendingInteraction` can resolve it, and must support **timeouts** (auto-pay smallest legal combination / auto-decline JSN) so a stalling/dropped player can't freeze the game.

---

## 3. COMPLETE RULESET (implement exactly)

### 3.1 Goal & flow
- 2–5 players. Win condition: be the first to have **3 complete property sets of different colors** laid in front of you, on your turn.
- Setup: remove the 4 rules cards (not used). Shuffle the remaining **106** cards. Deal **5 cards** to each player (face down, private hand). Place rest as the **draw pile**.
- **Turn structure:**
  1. **Draw 2** cards from the draw pile at the start of your turn (exception: if you start your turn with **0 cards in hand**, draw **5** instead of 2).
  2. **Play up to 3 cards** (you may play fewer or none). Each card is one "play." A card can be played as: a property (into your tableau), money (into your bank), or an action (resolve its effect). Money and most action cards may instead be **banked as money** (this counts as one of your 3 plays and the card is then just money).
  3. **End turn → discard** down to a **maximum of 7 cards in hand**. Excess goes to the discard pile.
- If the draw pile empties, reshuffle the discard pile to form a new draw pile.

### 3.2 Property sets, set sizes, and the rent chart
Each color needs a specific number of cards for a **complete set**. Rent is the value in the row matching how many cards you currently have in that set (you charge the value for the count you own, not the full set).

| Set | Cards to complete | Rent: 1 / 2 / 3 / 4 cards | Property face value (bank $) |
|---|---|---|---|
| Brown | 2 | 1 / 2 | $1 |
| Light Blue | 3 | 1 / 2 / 3 | $1 |
| Pink (Magenta) | 3 | 1 / 2 / 4 | $2 |
| Orange | 3 | 1 / 3 / 5 | $2 |
| Red | 3 | 2 / 3 / 6 | $3 |
| Yellow | 3 | 2 / 4 / 6 | $3 |
| Green | 3 | 2 / 4 / 7 | $4 |
| Dark Blue | 2 | 3 / 8 | $4 |
| Railroad | 4 | 1 / 2 / 3 / 4 | $2 |
| Utility | 2 | 1 / 2 | $2 |

> Verify these exact rent values and face values against scanned reference cards before hardcoding; the structure above is canonical but confirm the numbers.

### 3.3 Full deck composition (106 playable cards)

**Property cards (28):** Brown ×2, Dark Blue ×2, Green ×3, Light Blue ×3, Orange ×3, Pink ×3, Red ×3, Yellow ×3, Railroad ×4, Utility ×2.

**Property wildcards (11):** can substitute for the color(s) shown; may be moved between sets freely **on your own turn**. Bank values approximate (verify):
- Dark Blue/Green ×1 ($4) · Green/Railroad ×1 ($4) · Utility/Railroad ×1 ($2) · Light Blue/Railroad ×1 ($4) · Light Blue/Brown ×1 ($1) · Pink/Orange ×2 ($2) · Red/Yellow ×2 ($3)
- **Multicolor (any color) ×2** — **value $0, cannot be banked or used as payment.** Can only be taken via Sly Deal / Forced Deal / Deal Breaker. Cannot count as a "complete set" on its own — it must join real property of a color.

**Money cards (20), total $57M:** $1 ×6, $2 ×5, $3 ×3, $4 ×3, $5 ×2, $10 ×1.

**Action cards (34)** — each may instead be banked as money for its bank value:

| Card | Count | Bank $ | Effect |
|---|---|---|---|
| Deal Breaker | 2 | 5 | Steal an entire **complete** set from any player (including its house/hotel). |
| Just Say No | 3 | 4 | Cancel any action played against you. Can be played out of turn. Does **not** count as a play. Can be chained (JSN on a JSN). |
| Sly Deal | 3 | 3 | Steal **1** property card from any player's **incomplete** set (not from a complete set; not a multicolor wild). |
| Forced Deal | 3 | 3 | Swap one of your properties for one of an opponent's. Neither may be from a complete set; not multicolor wilds. |
| Debt Collector | 3 | 3 | One chosen player owes you **$5M**. |
| It's My Birthday | 3 | 2 | **Every** other player owes you **$2M**. |
| Pass Go | 10 | 1 | Draw **2** cards immediately (counts as one play). |
| House | 3 | 3 | Add to a **complete, buildable** set (not Railroad/Utility). Adds **+$3** to that set's rent. |
| Hotel | 2 | 4 | Add to a complete set that **already has a house**. Adds **+$4** to rent. |
| Double The Rent | 2 | 1 | Play **with** a Rent card to double it. Consumes an **extra play** (rent + double = 2 of your 3 plays). |

**Rent cards (13):**
- Two-color rent ×10 (bank $1 each): Dark Blue/Green ×2, Red/Yellow ×2, Pink/Orange ×2, Light Blue/Brown ×2, Railroad/Utility ×2. Charge **all** opponents rent for **one** of the two colors you choose (you must own property of that color; rent = chart value for how many you own).
- Wild Rent ×3 (bank $3 each): charge **one** chosen player rent for **any one** color you own.

> Standard rule: a normal Rent card charges **all** opponents; Wild Rent targets **one** player. Implement both.

### 3.4 Payment rules (critical — get these exactly right)
- When you owe money, you pay using **money cards and/or banked action cards from your bank, and/or property cards** from your tableau — **your choice** which.
- **No change is ever given.** If you owe $5M and pay with a $10M card, the creditor keeps the $10M. If you owe $2M and only have a $3M card, you pay the $3M.
- If you have **no cards at all** (empty bank and no properties), you pay **nothing** and owe nothing further.
- You **may** pay using property cards, including breaking a set — but you choose; you are never forced to pay from a complete set if you have other assets. (You only pay properties if you lack enough bank money, or choose to.)
- Properties paid go into the **creditor's property area**, not their hand. Money/banked cards go into the creditor's **bank**.
- **Multicolor wildcards cannot be used to pay** (no value).
- House/Hotel cards, if in the bank, are paid as money; if they were on a set, they are not normally used to pay rent (they stay) — implement: only bank assets and property cards are valid payment.

### 3.5 Just Say No (JSN) resolution
- When player A targets player B with an action (Sly Deal, Forced Deal, Deal Breaker, Debt Collector, It's My Birthday, Rent, Double Rent), B may respond with JSN to cancel it.
- A may respond to B's JSN with their own JSN (un-cancel). This **chains** until someone has no JSN or declines. Final parity decides: odd number of JSNs played → action canceled; even → action proceeds.
- JSN does not count as one of the player's 3 plays and may be played during another player's turn.
- It's My Birthday / a normal Rent card hits multiple players — each targeted player resolves their own JSN independently.

### 3.6 Houses & Hotels
- House only on a **complete** non-Railroad/non-Utility set. Hotel only on a complete set that **already has a house**. One house and one hotel max per set. They add +$3 / +$4 to that set's rent respectively.
- If a complete set with a house/hotel is taken by **Deal Breaker**, the buildings go with it.
- If a set loses a property (e.g. Sly Deal can't target complete sets, but Forced Deal/payment could break it) and is no longer complete, the house/hotel becomes "orphaned" — implement the common rule: orphaned buildings move to the bank as money. (Document this choice in-game rules tooltip.)

### 3.7 Wildcards
- A two-color wildcard counts as either of its colors; the owner may reassign it among their sets **only on their own turn**, and reassigning is free (not a play). Multicolor wild = any color, same rules, but $0 and never payable/discardable as money.

---

## 4. DATA MODEL (Supabase / Postgres)

```sql
-- rooms
id uuid pk
code text unique            -- 4–5 char human code, ambiguous chars removed (no O/0/I/1)
status text                 -- 'lobby' | 'in_game' | 'finished'
host_player uuid
config jsonb                 -- {maxPlayers, botCount, houseRules}
created_at, updated_at

-- players (seat in a room)
id uuid pk
room_id uuid fk
display_name text
avatar text
seat_index int
is_bot boolean
connected boolean
last_seen timestamptz

-- games (canonical state; server-only readable)
id uuid pk
room_id uuid fk
state jsonb                  -- full GameState incl. all hands + deck order
version int                  -- bumped each move; used for optimistic concurrency
turn_player uuid
phase text
updated_at

-- moves (append-only log for replay/audit/animation)
id bigserial pk
game_id uuid fk
version int
player_id uuid
move jsonb
events jsonb                 -- GameEvent[] for client animation
created_at
```

**RLS:** clients may read `rooms`, `players` (public lobby info) and the `moves` log (events are safe — they describe public outcomes), but **cannot read `games.state`**. State access is only via a Server Action / RPC `get_my_view(room_id)` that runs the engine's `redactStateFor` for `auth.uid()`. Writes to game state happen only through the authoritative Server Action.

Auth: anonymous Supabase auth (each browser gets an anon user) is sufficient — no signup needed to play with friends. Persist a chosen display name in localStorage.

---

## 5. MULTIPLAYER FLOW

1. **Create Room:** host picks name/avatar + config (max players, optional bots to fill seats, house-rule toggles). Server creates `room` + `code`, seats host. Show lobby with the code + a one-tap "copy link" (`/join/<code>`).
2. **Join Room:** enter code or open invite link → pick name/avatar → seated. Lobby shows all seats live (Supabase **Presence** for who's connected). Host can add/remove bots and **Start**.
3. **In game:** each move = `applyMove` Server Action → persist (version check) → append to `moves` → broadcast `state_changed` on the room's Realtime channel. All clients refetch their redacted view + read new `moves` events to drive animations.
4. **Presence + reconnection:** track connected players via Presence. On refresh/drop, client rejoins channel and refetches current view — resumes seamlessly. If a player is disconnected and it becomes their turn, run the **turn timer**; on timeout, auto-resolve minimally (auto-draw, auto-pay smallest legal set, auto-decline JSN, auto-discard highest-count-safe cards) so the game never stalls. Optionally allow host to convert a long-disconnected player into a bot.
5. **Concurrency:** server rejects a move whose `version` doesn't match current (stale client) and tells it to refetch. Only legal moves from `getLegalMoves` for the authorized player are accepted.

Edge cases to handle: host leaves (promote next seat to host), everyone leaves (mark room finished after grace period), spectators after game start (block joining an in-progress game unless filling a dropped seat).

---

## 6. SINGLE-PLAYER FLOW

- Menu → **Play vs Bots** → choose number of bots (1–4) and difficulty (Easy / Normal / Hard) → start. Everything runs locally via the engine; bots take turns with a short, watchable delay and visible "thinking" + telegraphed plays (so the human can follow). Persist the in-progress game to localStorage so a refresh resumes it.

---

## 7. BOT AI

Bots consume `getLegalMoves` and pick via a **heuristic scoring function** (no ML needed). Priorities, roughly:

1. **Win check:** if a legal sequence completes a 3rd set this turn, do it.
2. **Defensive value:** prefer banking enough money to survive likely rent; keep a Just Say No in hand if holding one and an opponent is one set from winning.
3. **Progress:** play properties that advance toward completing sets; prefer cards that complete or near-complete a set; assign wildcards to the most-progressed set.
4. **Aggression (scaled by difficulty):**
   - Deal Breaker → target an opponent's most valuable **complete** set, especially if it would deny a near-win.
   - Sly Deal → steal the card that most advances the bot's own near-complete set.
   - Forced Deal → trade a low-value spare for a high-value needed property.
   - Rent → charge when the bot owns high-rent sets and opponents have payable assets; use Double Rent when it owns a big set and opponents are cash-rich.
   - It's My Birthday / Debt Collector → when opponents have liquid banks.
5. **Pass Go** early to dig for properties when hand is thin.
6. **JSN usage:** spend JSN to block high-impact actions (Deal Breaker on a complete set, large rent, a steal of a near-complete set), not on cheap ones.
7. **Discard:** at >7, discard lowest strategic value (excess money over expected rent, redundant low-rent properties), keep JSN and set-completing cards.

Difficulty knobs: lookahead depth (1 vs simple 2-ply for Hard), randomness/temperature on choices, willingness to use scarce cards, and how reliably it holds JSN defensively.

---

## 8. UI / UX & VISUAL DESIGN

> Read the `frontend-design` skill first and follow its design-token guidance. The goal is a premium, tactile card game — think a refined casino-felt-meets-modern-fintech aesthetic, not a clip-art board game.

### 8.1 Art direction
- **Original** card designs: clean, bold color blocks per property color, a custom monospaced/grotesque numeral for money, distinct iconography per action card. Subtle paper/linen texture, soft inner shadows, rounded corners, a thin metallic edge on rare cards (Deal Breaker, JSN).
- Dark, warm table surface (deep felt green or charcoal with a vignette). Strong color from the cards is the visual energy.
- Define a token system (CSS vars): per-color property palette, surface levels, elevation shadows, radii, motion timings. Light + dark theme; default dark.
- Typography: one expressive display face for headings/logo, one clean sans for UI, tabular numerals for money.

### 8.2 Layout
- **Table view:** opponents arranged around the top/sides (avatar, name, hand-count badge, bank total, property sets as compact stacked color columns, connection dot, turn indicator). Center: draw pile + discard pile + current-action banner + turn timer ring. Bottom: **your hand** as an arc/fan of cards, your bank, and your property sets in clearly labeled color columns with completion meters (e.g. "2/3").
- Responsive: on mobile, your hand is a horizontally scrollable fan with snap; opponents collapse into compact cards you can tap to expand; property columns become a swipeable shelf.
- Persistent **action log / feed** (collapsible) describing public events in plain language ("Maya charged everyone $4M Red rent").

### 8.3 Interactions
- **Drag** a card from hand to: Bank zone, a Property column (auto-validates target color), or the Action drop zone (center). Invalid targets dim; valid targets highlight. Tap-to-act fallback for accessibility/mobile (tap card → choose destination from a radial/sheet menu).
- Clear **"plays remaining this turn: ●●○"** indicator. Disable illegal plays with a tooltip explaining why.
- Targeting flow for Sly/Forced Deal/Deal Breaker/Debt Collector/Wild Rent: after playing the action, enter a **target-selection mode** (opponent/property highlights; confirm/cancel).
- Payment flow: a modal shows what you owe and to whom; you select cards from bank + properties; running total shows; "Pay" enabled when you've paid as much as you legally must (respecting no-change + pay-all-if-short). One-tap "auto-pay smallest" helper.
- JSN prompt: when targeted, a prominent, time-boxed prompt — "Block this with Just Say No?" with Block / Allow and a countdown.

### 8.4 Animations (Framer Motion)
- **Shared-element card flight** via `layoutId`: cards physically travel hand→bank, deck→hand, hand→property column, across the table on steals, with easing and slight arc + rotation. Card flips (back→front) on draw/reveal with a 3D `rotateY`.
- Deal animation at game start: cards fan out to each player in sequence.
- Bank totals **count up** when money lands; rent payments show coins/notes flying from debtor to creditor.
- Turn handoff: the active player's frame pulses; a sweeping highlight indicates whose turn it is.
- **Win sequence:** full-screen **confetti** (`canvas-confetti`, multi-burst + streamers), the 3 winning sets spotlighted, a victory banner with the winner's avatar, stats summary (turns taken, biggest rent, sets stolen), and "Rematch" / "Back to lobby."
- Micro-interactions: hover lift on cards, satisfying tap/drag spring physics, subtle haptics on mobile (`navigator.vibrate`).
- Respect `prefers-reduced-motion`: replace flights with quick fades.

### 8.5 Sound (Howler, all original/royalty-free)
Card draw, card place, money chime, rent "cha-ching," steal/sabotage sting, JSN "denied" sound, turn-start tone, win fanfare. Master mute toggle persisted in localStorage. Keep it tasteful and skippable.

### 8.6 Screens
1. Home / menu (Play vs Bots, Create Room, Join Room, How to Play, settings).
2. Name + avatar picker.
3. Lobby (room code, copy link, seat list w/ presence, bot controls, start).
4. Game table (the main view).
5. Interaction overlays (payment, targeting, JSN).
6. Win/Game-over.
7. **How to Play** — interactive, scannable rules reference (card glossary with the §3 tables, searchable).

---

## 9. PROJECT STRUCTURE

```
/app
  /(menu)/page.tsx                 home
  /play/page.tsx                   single-player table
  /room/[code]/page.tsx            multiplayer table + lobby
  /api or /actions                 authoritative server actions (applyMove, createRoom, joinRoom, getMyView, startGame)
/lib
  /engine                          PURE: types, deck, createInitialState, getLegalMoves, applyMove, redactStateFor, isGameOver, serialize
  /engine/__tests__                Vitest specs (one per action + edge cases)
  /bot                             heuristic bot (uses engine only)
  /supabase                        client + server clients, realtime helpers, RLS-safe queries
  /sound, /confetti, /motion       presentation helpers
/components
  /cards (Card, CardFan, PropertyColumn, Bank)
  /table (OpponentSeat, CenterPiles, ActionLog, TurnTimer)
  /overlays (PaymentModal, TargetMode, JsnPrompt, WinScreen)
  /ui (shadcn)
/store                             zustand (UI/animation state only; never source of truth in MP)
```

Keep `/lib/engine` 100% pure and dependency-free so it runs identically on client and server and is trivially unit-testable.

---

## 10. EDGE CASES & RULES NUANCES — TEST THESE EXPLICITLY

1. Start turn with 0 cards → draw 5, not 2.
2. No change on overpayment; pay-all when short; pay nothing when assetless.
3. Multicolor wild: never bankable, never payable, never discardable as money; only stealable.
4. Sly Deal cannot take from a complete set; Forced Deal cannot use/take from complete sets.
5. Deal Breaker takes the whole set **including** house/hotel.
6. JSN chains (0,1,2,3 JSNs) resolve to correct final parity; JSN playable out of turn; doesn't consume a play.
7. Rent (normal) hits all opponents; Wild Rent hits one chosen; Double Rent needs a rent card and consumes 2 plays total; JSN cancels the rent+double together.
8. House before Hotel; not on Railroad/Utility; one each per set; orphaned building → bank.
9. Wildcard reassignment only on owner's turn, free, and may move a wild that completes/uncompletes a set (recompute completeness + rent live).
10. Draw pile exhaustion → reshuffle discard.
11. Hand limit 7 enforced only at end of turn (you may exceed mid-turn via Pass Go).
12. Win check triggers the instant a player holds 3 complete different-color sets **on their own turn** (e.g. after a Deal Breaker steal). A set must be fully complete (multicolor-wild alone is not a set).
13. Two players "simultaneously" eligible can't happen — win only checked on the acting player's turn.
14. Concurrency: stale-version move rejected; client refetches.
15. Disconnect timeout auto-resolution for draw/pay/JSN/discard.

---

## 11. BUILD ORDER (milestones — ship each before the next)

1. **Engine + tests.** Implement `/lib/engine` fully with Vitest covering §3 and §10. No UI. This is the foundation; do not proceed until tests pass.
2. **Single-player UI, no animation.** Static table that renders engine state, lets the human play, runs bots. Prove the full game is playable end-to-end.
3. **Animations + sound + confetti.** Layer Framer Motion shared-element flights, payment/targeting/JSN overlays, win sequence.
4. **Polish + responsive + reduced-motion + a11y.** Mobile layout, keyboard/tap fallbacks, theming, How-to-Play.
5. **Multiplayer.** Supabase schema + RLS, anon auth, create/join room, lobby + presence, authoritative `applyMove` Server Action, redacted `getMyView`, realtime signal+refetch, reconnection + timeouts.
6. **Hardening.** Concurrency, edge-case auditing in MP, load test a 5-player room, Playwright E2E for both modes, deploy to Vercel with Supabase env wired.

---

## 12. QUALITY BAR / DEFINITION OF DONE

- TypeScript strict, no `any` in engine. Engine pure and fully unit-tested.
- 60fps animations on a mid-range phone; `prefers-reduced-motion` honored.
- No hidden-info leak verifiable in network tab / React devtools (audit explicitly).
- Multiplayer game completes correctly across two real devices on different networks.
- Accessible: focus states, ARIA on interactive cards, tap fallback for every drag.
- Clean README: env vars, Supabase setup SQL, local dev, deploy steps.

---

## 13. THINGS TO CONFIRM AGAINST A REFERENCE BEFORE HARDCODING

- Exact rent values per set and exact face (bank) values of every property, wildcard, and action card (§3.2/§3.3). Use scanned official cards as ground truth; the structure here is correct but verify each number.
- The orphaned-house/hotel rule and the house+hotel combined rent ($7 total added) are the common community conventions — expose them as **house-rule toggles** in room config so players can switch behavior.

Build it clean, test the engine first, and make the table feel alive.
