"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ClipboardList,
  Crown,
  DoorOpen,
  Hand,
  Info,
  Play,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseBotMove } from "@/lib/bot";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PROPERTY_COLORS,
  assignableColors,
  chooseAutoPayment,
  getLegalMoves,
  isMoveLegal,
  propertyCardsFor,
  rentForColor,
  type Card,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerState,
  type RedactedPlayerState,
  type RedactedState,
  type PropertyColor,
  type TableauCard,
} from "@/lib/engine";
import { playSfx } from "@/lib/sound/sfx";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardView, propertyColorStyle } from "@/components/game/card-view";
import { submitMoveAction, getMyView } from "@/app/actions/rooms";

type PaymentAsset = {
  card: Card;
  source: "bank" | "property";
  label: string;
};

function moveCardId(move: Move): string | undefined {
  if ("cardId" in move) return move.cardId;
  return undefined;
}

function moveUsesSelected(move: Move, selectedCardId: string): boolean {
  return moveCardId(move) === selectedCardId || ("doubleRentCardId" in move && move.doubleRentCardId === selectedCardId);
}

function colorName(color: PropertyColor): string {
  return color
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function eventToSfx(event: GameEvent): "draw" | "place" | "money" | "steal" | "no" | "turn" | "win" {
  if (event.type === "draw") return "draw";
  if (event.type === "payment" || event.type === "rent" || event.type === "bank") return "money";
  if (event.type === "steal" || event.type === "swap") return "steal";
  if (event.type === "jsn") return "no";
  if (event.type === "turn") return "turn";
  if (event.type === "win") return "win";
  return "place";
}

function redactedPlayerNetWorth(player: RedactedPlayerState): number {
  return player.bankTotal + player.properties.reduce((sum, entry) => sum + entry.card.value, 0) + player.buildings.reduce((sum, entry) => sum + entry.card.value, 0);
}

function getGroupedProperties(player: RedactedPlayerState): { color: PropertyColor; cards: TableauCard[]; rent: number; complete: boolean }[] {
  return PROPERTY_COLORS.map((color) => ({
    color,
    cards: propertyCardsFor(player as unknown as PlayerState, color),
    rent: rentForColor(player as unknown as PlayerState, color),
    complete: player.completeSets.includes(color),
  })).filter((group) => group.cards.length > 0);
}

function paymentAssets(player: RedactedPlayerState): PaymentAsset[] {
  return [
    ...(player.bank ?? []).map((card) => ({
      card,
      source: "bank" as const,
      label: `Bank - ${card.name}`,
    })),
    ...player.properties
      .filter((entry) => !entry.card.isMulticolor)
      .map((entry) => ({
        card: entry.card,
        source: "property" as const,
        label: `${colorName(entry.assignedColor)} property - ${entry.card.name}`,
      })),
  ];
}

function reconstructGameState(redacted: RedactedState, localPlayerId: string): GameState {
  const currentPlayerIndex = redacted.players.findIndex((p) => p.id === redacted.currentPlayerId);
  return {
    id: redacted.id,
    config: { houseRules: { orphanBuildingsToBank: true } },
    currentPlayerIndex: currentPlayerIndex >= 0 ? currentPlayerIndex : 0,
    phase: redacted.phase,
    turnNumber: redacted.turnNumber,
    playsRemaining: redacted.playsRemaining,
    pendingInteraction: redacted.pendingInteraction,
    log: redacted.log,
    version: redacted.version,
    rngSeed: 0,
    discard: redacted.discardTop ? [redacted.discardTop] : [],
    deck: Array.from({ length: redacted.deckCount }, (_, i) => ({ id: `deck-${i}`, defId: "dummy", kind: "money" as const, name: "Deck Card", value: 0 })),
    players: redacted.players.map((p) => {
      const isLocal = p.id === localPlayerId;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot ?? false,
        connected: p.connected ?? true,
        hand: isLocal ? (p.hand ?? []) : Array.from({ length: p.handCount }, (_, i) => ({ id: `dummy-hand-${i}`, defId: "dummy", kind: "money" as const, name: "Opponent Card", value: 0 })),
        bank: isLocal ? (p.bank ?? []) : Array.from({ length: p.bankCount }, (_, i) => ({ id: `dummy-bank-${i}`, defId: "dummy", kind: "money" as const, name: "Opponent Bank", value: 0 })),
        properties: p.properties,
        buildings: p.buildings,
      };
    }),
  };
}

function SetColumn({ group, small }: { group: ReturnType<typeof getGroupedProperties>[number]; small?: boolean }) {
  const progress = Math.min(100, (group.cards.length / (group.color === "railroad" ? 4 : group.color === "brown" || group.color === "dark-blue" || group.color === "utility" ? 2 : 3)) * 100);

  return (
    <div className={cn("min-w-28 rounded-md border border-white/10 bg-white/[0.055] p-2", small && "min-w-20 p-1.5")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase text-zinc-200">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: propertyColorStyle(group.color) }} />
          {small ? colorName(group.color).slice(0, 6) : colorName(group.color)}
        </span>
        <Badge variant={group.complete ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
          {group.cards.length}
        </Badge>
      </div>
      <Progress value={progress} className="h-1.5 bg-zinc-800" />
      <div className="mt-2 flex -space-x-7">
        {group.cards.map((entry) => (
          <CardView key={entry.card.id} card={entry.card} compact className={small ? "h-20 w-14" : "h-24 w-16"} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] text-emerald-200">Rent ${group.rent}M</p>
    </div>
  );
}

function PlayerPanel({ player, active, self }: { player: RedactedPlayerState; active: boolean; self?: boolean }) {
  const groups = getGroupedProperties(player);
  return (
    <motion.section
      layout
      className={cn(
        "rounded-lg border bg-zinc-950/50 p-3 shadow-lg",
        active ? "border-emerald-300 shadow-emerald-500/20" : "border-white/10",
        self && "bg-emerald-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-zinc-900 font-mono text-sm font-black">
            {player.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold">{player.name}</p>
              {player.isBot && <Bot className="h-3.5 w-3.5 text-zinc-400" />}
              {player.connected === false && <Badge variant="destructive" className="h-4 text-[9px] px-1">Offline</Badge>}
            </div>
            <p className="font-mono text-[11px] text-zinc-400">
              {player.handCount} cards · ${player.bankTotal}M bank · ${redactedPlayerNetWorth(player)}M worth
            </p>
          </div>
        </div>
        {active && <Badge className="bg-emerald-300 text-emerald-950">Turn</Badge>}
      </div>
      {groups.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {groups.map((group) => (
            <SetColumn key={group.color} group={group} small={!self} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-white/10 py-5 text-center text-xs text-zinc-500">No properties yet</p>
      )}
    </motion.section>
  );
}

function RulesSheet() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <Info className="h-4 w-4" />
        Rules
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-zinc-950 text-zinc-50 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>How to Play</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="flow" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="edge">Nuance</TabsTrigger>
          </TabsList>
          <TabsContent value="flow" className="space-y-3 text-sm text-zinc-300">
            <p>Draw 2 at turn start. If your hand is empty, draw 5. Play up to 3 cards, then discard down to 7.</p>
            <p>First player to complete 3 different property sets on their own turn wins immediately.</p>
            <p>Money and action/rent cards can be banked. Properties are played to sets and can later be used as payment.</p>
          </TabsContent>
          <TabsContent value="cards" className="space-y-3 text-sm text-zinc-300">
            <p>Normal rent cards charge every opponent for one listed color you own. Wild Rent targets one player for any color you own.</p>
            <p>Hard No blocks targeted actions and can be chained. Odd chains cancel the action; even chains let it through.</p>
            <p>House and Hotel only attach to complete non-railroad, non-utility sets. Hotel requires a House first.</p>
          </TabsContent>
          <TabsContent value="edge" className="space-y-3 text-sm text-zinc-300">
            <p>No change is given. If you owe $5M and pay $10M, the receiver keeps it all.</p>
            <p>If you are short, you pay every valid asset you have. Prismatic wilds are never payable.</p>
            <p>If a built set breaks, orphaned House/Hotel cards move into that player&apos;s bank as money.</p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function RoomGameClient({
  roomId,
  playerId,
  initialView,
  isHost,
}: {
  roomId: string;
  playerId: string;
  initialView: RedactedState;
  isHost: boolean;
}) {
  const [state, setState] = useState<RedactedState>(initialView);
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [muted, setMuted] = useState(false);

  const supabase = getSupabaseBrowserClient();

  const human = state.players.find((player) => player.id === playerId) ?? state.players[0];
  const current = state.players.find((p) => p.id === state.currentPlayerId) ?? state.players[0];

  const dummyGameState = useMemo(() => reconstructGameState(state, playerId), [state, playerId]);
  const legalMoves = useMemo(() => getLegalMoves(dummyGameState, playerId), [dummyGameState, playerId]);

  const selectedCard = (human.hand ?? []).find((card) => card.id === selectedCardId) ?? human.properties.find((entry) => entry.card.id === selectedCardId)?.card;
  const selectedMoves = selectedCardId ? legalMoves.filter((move) => moveUsesSelected(move, selectedCardId)) : [];
  const drawMove = legalMoves.find((move) => move.type === "draw");
  const endTurnMove = legalMoves.find((move) => move.type === "end_turn");
  const discardMove = legalMoves.find((move) => move.type === "discard");
  const winner = state.winnerId ? state.players.find((player) => player.id === state.winnerId) : undefined;

  const playEvents = useCallback(
    (events: GameEvent[]) => {
      for (const event of events) {
        playSfx(eventToSfx(event), muted);
      }
    },
    [muted],
  );

  const commitMove = useCallback(
    async (move: Move) => {
      try {
        const result = await submitMoveAction(roomId, playerId, state.version, move);
        if (result.ok) {
          const prevLogLen = state.log.length;
          setState(result.view);
          playEvents(result.view.log.slice(prevLogLen));
          setSelectedCardId(undefined);
          setSelectedPaymentIds([]);
          setMessage(undefined);
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage("Connection failed");
      }
    },
    [playEvents, state.version, state.log.length, roomId, playerId],
  );

  const logLengthRef = useRef(initialView.log.length);

  useEffect(() => {
    logLengthRef.current = state.log.length;
  }, [state.log.length]);

  const refetchState = useCallback(async () => {
    const fresh = await getMyView(roomId, playerId);
    if (fresh) {
      const prevLogLen = logLengthRef.current;
      setState(fresh);
      playEvents(fresh.log.slice(prevLogLen));
    }
  }, [roomId, playerId, playEvents]);

  // Subscribe to updates on the moves table (publicly visible with SELECT policy)
  useEffect(() => {
    const gameChannel = supabase
      .channel(`moves:${state.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "moves", filter: `game_id=eq.${state.id}` },
        () => {
          refetchState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gameChannel);
    };
  }, [state.id, supabase, refetchState]);

  useEffect(() => {
    const savedMuted = window.localStorage.getItem("deal.muted") === "true";
    setMuted(savedMuted);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("deal.muted", String(muted));
  }, [muted]);

  useEffect(() => {
    if (!winner) return;
    playSfx("win", muted);
    confetti({ particleCount: 140, spread: 75, origin: { y: 0.68 } });
    window.setTimeout(() => confetti({ particleCount: 90, spread: 120, origin: { y: 0.22 } }), 350);
  }, [muted, winner]);

  // Auto-draw turn execution
  useEffect(() => {
    if (winner || !state || !drawMove) return;

    if (state.currentPlayerId === playerId) {
      const timer = window.setTimeout(() => {
        commitMove(drawMove);
      }, 750);
      return () => window.clearTimeout(timer);
    }
  }, [state, drawMove, winner, playerId, commitMove]);

  // Host Bot controller
  useEffect(() => {
    if (!isHost || winner || !state) return;

    const currentActorId = state.pendingInteraction?.kind === "payment"
      ? state.pendingInteraction.debt.debtorId
      : state.pendingInteraction?.kind === "just_say_no"
      ? state.pendingInteraction.currentResponderId
      : state.currentPlayerId;

    const actor = state.players.find((p) => p.id === currentActorId);
    if (!actor || !actor.isBot) return;

    const timer = window.setTimeout(async () => {
      const fullGameStateDummy = reconstructGameState(state, actor.id);
      const move = chooseBotMove(fullGameStateDummy, actor.id, "normal");
      if (!move) return;

      const res = await submitMoveAction(roomId, actor.id, state.version, move);
      if (res.ok) {
        const prevLen = state.log.length;
        setState(res.view);
        playEvents(res.view.log.slice(prevLen));
      }
    }, state.pendingInteraction ? 1000 : 1500);

    return () => window.clearTimeout(timer);
  }, [state, isHost, winner, roomId, playEvents]);

  const playerName = (id: string) => {
    return state.players.find((p) => p.id === id)?.name ?? id;
  };

  const moveLabel = (move: Move): string => {
    if (move.type === "play_to_bank") return "Bank for money";
    if (move.type === "play_property") return `Play to ${colorName(move.assignedColor)}`;
    if (move.type === "reassign_wild") return `Reassign to ${colorName(move.assignedColor)}`;
    if (move.type === "play_pass_go") return "Draw 2 now";
    if (move.type === "play_house") return `Build House on ${colorName(move.color)}`;
    if (move.type === "play_hotel") return `Build Hotel on ${colorName(move.color)}`;
    if (move.type === "play_rent") {
      const target = move.targetId ? ` from ${playerName(move.targetId)}` : " from everyone";
      return `${move.doubleRentCardId ? "Double " : ""}${colorName(move.color)} rent${target}`;
    }
    if (move.type === "play_debt_collector") return `Collect $5M from ${playerName(move.targetId)}`;
    if (move.type === "play_birthday") return "Collect $2M from everyone";
    if (move.type === "play_sly_deal") return `Take property from ${playerName(move.targetId)}`;
    if (move.type === "play_forced_deal") return `Swap with ${playerName(move.targetId)}`;
    if (move.type === "play_deal_breaker") return `Sweep ${playerName(move.targetId)}'s ${colorName(move.color)} set`;
    if (move.type === "end_turn") return "End turn";
    if (move.type === "draw") return "Draw";
    if (move.type === "discard") return "Discard selected";
    if (move.type === "respond_jsn") return move.useCardId ? "Block with Hard No" : "Allow";
    if (move.type === "pay") return "Pay";
    return "Play";
  };

  const pendingPayment = state.pendingInteraction?.kind === "payment" && state.pendingInteraction.debt.debtorId === human.id
    ? state.pendingInteraction
    : undefined;
  const pendingJsn = state.pendingInteraction?.kind === "just_say_no" && state.pendingInteraction.currentResponderId === human.id
    ? state.pendingInteraction
    : undefined;
  const assets = paymentAssets(human);
  const selectedPaymentTotal = assets
    .filter((asset) => selectedPaymentIds.includes(asset.card.id))
    .reduce((total, asset) => total + asset.card.value, 0);
  const pendingPayMove: Move | undefined = pendingPayment
    ? { type: "pay", playerId: human.id, cardIds: selectedPaymentIds }
    : undefined;
  const canPay = pendingPayMove ? isMoveLegal(dummyGameState, pendingPayMove) : false;

  const togglePayment = (cardId: string) => {
    setSelectedPaymentIds((currentIds) =>
      currentIds.includes(cardId) ? currentIds.filter((id) => id !== cardId) : [...currentIds, cardId],
    );
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(44,137,102,0.26),transparent_36%),linear-gradient(135deg,#06110e,#0e1716_45%,#130d10)] text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-300" />
              <h1 className="text-xl font-black tracking-tight">DEAL!</h1>
              <Badge variant="outline" className="border-emerald-300/40 text-emerald-100">
                Turn {state.turnNumber}
              </Badge>
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                Room Match
              </Badge>
            </div>
            <p className="text-xs text-zinc-400">
              {winner ? `${winner.name} won` : `${current.name} is active · ${state.phase.replace("_", " ")}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-zinc-800 text-zinc-200">
              Plays: {"●".repeat(state.playsRemaining)}
              {"○".repeat(Math.max(0, 3 - state.playsRemaining))}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setMuted((value) => !value)}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              Sound
            </Button>
            <RulesSheet />
            <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <DoorOpen className="h-4 w-4" />
              Exit Room
            </Link>
          </div>
        </header>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-sm text-amber-100"
          >
            {message}
          </motion.div>
        )}

        <section className="grid flex-1 grid-rows-[auto_1fr_auto] gap-4">
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {state.players
              .filter((player) => player.id !== playerId)
              .map((player) => (
                <PlayerPanel key={player.id} player={player} active={state.currentPlayerId === player.id} />
              ))}
          </div>

          <div className="grid min-h-[360px] lg:h-[400px] gap-4 lg:grid-cols-[1fr_340px]">
            <section className="relative overflow-hidden rounded-lg border border-emerald-200/10 bg-[radial-gradient(circle_at_50%_50%,rgba(19,83,58,0.6),rgba(8,34,27,0.75)_52%,rgba(5,12,10,0.9))] p-4 shadow-2xl">
              <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(120deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="relative grid h-full place-items-center">
                <div className="grid grid-cols-3 items-center gap-5">
                  <div className="text-center">
                    <CardView faceDown compact className="mx-auto h-32 w-24" />
                    <p className="mt-2 font-mono text-xs text-zinc-300">{state.deckCount} in draw</p>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    {drawMove && (
                      <Button size="lg" onClick={() => commitMove(drawMove)}>
                        <Play className="h-4 w-4" />
                        Draw Cards
                      </Button>
                    )}
                    {endTurnMove && (
                      <Button variant="secondary" onClick={() => commitMove(endTurnMove)}>
                        <Check className="h-4 w-4" />
                        End Turn
                      </Button>
                    )}
                    {discardMove && (
                      <Button variant="destructive" onClick={() => commitMove(discardMove)}>
                        <ClipboardList className="h-4 w-4" />
                        Auto Discard
                      </Button>
                    )}
                    <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-center text-xs text-zinc-300">
                      {state.pendingInteraction ? "Resolve the prompt to continue" : `${current.name}'s ${state.phase} phase`}
                    </div>
                  </div>
                  <div className="text-center">
                    {state.discardTop ? (
                      <CardView card={state.discardTop} compact className="mx-auto h-32 w-24" />
                    ) : (
                      <div className="mx-auto grid h-32 w-24 place-items-center rounded-lg border border-dashed border-white/20 text-xs text-zinc-500">
                        Empty
                      </div>
                    )}
                    <p className="mt-2 font-mono text-xs text-zinc-300">Discard pile</p>
                  </div>
                </div>
              </div>
            </section>

            <aside className="flex h-[280px] lg:h-full min-h-0 flex-col rounded-lg border border-white/10 bg-zinc-950/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Action Feed</h2>
                <Badge variant="secondary">{state.version}</Badge>
              </div>
              <ScrollArea className="min-h-0 flex-1 pr-3">
                <div className="space-y-2">
                  {[...state.log].reverse().map((event) => (
                    <div key={event.id} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
                      {event.message}
                    </div>
                  ))}
                  {state.log.length === 0 && <p className="py-8 text-center text-xs text-zinc-500">No public actions yet.</p>}
                </div>
              </ScrollArea>
            </aside>
          </div>

          <section className="rounded-lg border border-white/10 bg-black/30 p-3 shadow-2xl">
            <PlayerPanel player={human} active={state.currentPlayerId === human.id} self />
            <Separator className="my-3 bg-white/10" />
            <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
              <div className="overflow-x-auto pb-2">
                <div className="flex min-h-56 items-end gap-2 px-1">
                  <AnimatePresence initial={false}>
                    {(human.hand ?? []).map((card, index, arr) => (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 20, rotate: 4 }}
                        animate={{ opacity: 1, y: 0, rotate: (index - arr.length / 2) * 1.2 }}
                        exit={{ opacity: 0, y: 20 }}
                      >
                        <CardView
                          card={card}
                          selected={selectedCardId === card.id}
                          disabled={state.currentPlayerId !== human.id && state.pendingInteraction?.kind !== "just_say_no"}
                          onClick={() => setSelectedCardId(card.id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {(human.hand ?? []).length === 0 && (
                    <div className="grid h-44 w-full place-items-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-500">
                      Your hand is empty. Draw 5 at your next draw phase.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-zinc-950/55 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Hand className="h-4 w-4 text-emerald-200" />
                  <h2 className="text-sm font-bold">Selected Card</h2>
                </div>
                {selectedCard ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-base font-black">{selectedCard.name}</p>
                      <p className="text-xs text-zinc-400">
                        Value ${selectedCard.value}M · {assignableColors(selectedCard).map(colorName).join(" / ") || "Action"}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {selectedMoves.map((move, index) => (
                        <Button key={`${move.type}-${index}`} variant="secondary" className="justify-start" onClick={() => commitMove(move)}>
                          {moveLabel(move)}
                        </Button>
                      ))}
                      {selectedMoves.length === 0 && (
                        <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
                          No legal move is available from this card right now.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                    Select a card to see legal plays. Invalid actions are not shown.
                  </p>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>

      <Dialog open={Boolean(pendingPayment)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/10 bg-zinc-950 text-zinc-50 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Due</DialogTitle>
            <DialogDescription className="text-zinc-400">
              You owe ${pendingPayment?.debt.amount ?? 0}M to {pendingPayment ? playerName(pendingPayment.debt.creditorId) : ""}. No change is given.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset) => (
              <button
                key={asset.card.id}
                type="button"
                onClick={() => togglePayment(asset.card.id)}
                className={cn(
                  "rounded-md border p-3 text-left transition",
                  selectedPaymentIds.includes(asset.card.id)
                    ? "border-emerald-300 bg-emerald-300/10"
                    : "border-white/10 bg-white/[0.04]",
                )}
              >
                <p className="text-sm font-bold">{asset.label}</p>
                <p className="font-mono text-xs text-zinc-400">${asset.card.value}M · {asset.source}</p>
              </button>
            ))}
            {assets.length === 0 && <p className="text-sm text-zinc-400">You have no payable assets.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
            <div>
              <p className="text-sm font-bold">Selected ${selectedPaymentTotal}M</p>
              <p className="text-xs text-zinc-400">Pay enough to cover the debt, or everything if you are short.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => pendingPayment && setSelectedPaymentIds(chooseAutoPayment(human as unknown as PlayerState, pendingPayment.debt.amount))}
              >
                Auto-pay
              </Button>
              <Button disabled={!canPay || !pendingPayMove} onClick={() => pendingPayMove && commitMove(pendingPayMove)}>
                Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingJsn)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/10 bg-zinc-950 text-zinc-50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Block this action?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {pendingJsn ? playerName(pendingJsn.effect.actorId) : "A player"} targeted you. Hard No can chain back and forth.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {legalMoves
              .filter((move) => move.type === "respond_jsn")
              .map((move, index) => (
                <Button
                  key={index}
                  variant={move.type === "respond_jsn" && move.useCardId ? "default" : "secondary"}
                  onClick={() => commitMove(move)}
                >
                  {move.type === "respond_jsn" && move.useCardId ? <Shield className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  {moveLabel(move)}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(winner)} onOpenChange={() => undefined}>
        <DialogContent className="border-emerald-300/30 bg-zinc-950 text-zinc-50 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-amber-300" />
              {winner?.name} wins
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Three complete property sets were finished on an active turn.
            </DialogDescription>
          </DialogHeader>
          {winner && (
            <div className="grid gap-2 sm:grid-cols-3">
              {winner.completeSets.slice(0, 3).map((color) => (
                <div key={color} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <span className="mb-2 block h-2 rounded-full" style={{ backgroundColor: propertyColorStyle(color) }} />
                  <p className="text-sm font-bold">{colorName(color)}</p>
                  <p className="font-mono text-xs text-zinc-400">Rent ${rentForColor(winner as unknown as PlayerState, color)}M</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonVariants({ variant: "default" })}>
              Back to menu
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-3 right-3 hidden rounded-full border border-white/10 bg-black/45 px-3 py-2 text-xs text-zinc-400 backdrop-blur sm:block">
        Real-time Connected
      </div>
    </main>
  );
}
