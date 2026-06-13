"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ClipboardList,
  Crown,
  DoorOpen,
  Info,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  CreditCard,
  History,
  X,
  AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { chooseBotMove, type BotDifficulty } from "@/lib/bot";
import {
  PROPERTY_COLORS,
  applyMove,
  bankTotal,
  chooseAutoPayment,
  completeSetColors,
  createInitialState,
  deserialize,
  getLegalMoves,
  isMoveLegal,
  playerNetWorth,
  propertyCardsFor,
  rentForColor,
  serialize,
  type Card,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerState,
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
import { CardView, propertyColorStyle } from "./card-view";

const STORAGE_KEY = "deal.single-player.v1";

type PaymentAsset = {
  card: Card;
  source: "bank" | "property";
  label: string;
};

function moveCardId(move: Move): string | undefined {
  if ("cardId" in move) {
    return move.cardId;
  }
  return undefined;
}

function moveUsesSelected(move: Move, selectedCardId: string): boolean {
  return moveCardId(move) === selectedCardId || ("doubleRentCardId" in move && move.doubleRentCardId === selectedCardId);
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function colorName(color: PropertyColor): string {
  return color
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function moveLabel(state: GameState, move: Move): string {
  if (move.type === "play_to_bank") return "Bank for Money";
  if (move.type === "play_property") return `Play to ${colorName(move.assignedColor)}`;
  if (move.type === "reassign_wild") return `Reassign to ${colorName(move.assignedColor)}`;
  if (move.type === "play_pass_go") return "Draw 2 Cards";
  if (move.type === "play_house") return `Build House on ${colorName(move.color)}`;
  if (move.type === "play_hotel") return `Build Hotel on ${colorName(move.color)}`;
  if (move.type === "play_rent") {
    const target = move.targetId ? ` from ${playerName(state, move.targetId)}` : " from everyone";
    return `${move.doubleRentCardId ? "Double " : ""}${colorName(move.color)} Rent${target}`;
  }
  if (move.type === "play_debt_collector") return `Collect $5M from ${playerName(state, move.targetId)}`;
  if (move.type === "play_birthday") return "Collect $2M from everyone";
  if (move.type === "play_sly_deal") return `Take property from ${playerName(state, move.targetId)}`;
  if (move.type === "play_forced_deal") return `Swap with ${playerName(state, move.targetId)}`;
  if (move.type === "play_deal_breaker") return `Sweep ${playerName(state, move.targetId)}'s ${colorName(move.color)} set`;
  if (move.type === "end_turn") return "End turn";
  if (move.type === "draw") return "Draw";
  if (move.type === "discard") return "Discard selected";
  if (move.type === "respond_jsn") return move.useCardId ? "Block with Just Say No" : "Allow Action";
  if (move.type === "pay") return "Pay Debt";
  return "Play Card";
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

function groupedProperties(player: PlayerState): { color: PropertyColor; cards: TableauCard[]; rent: number; complete: boolean }[] {
  return PROPERTY_COLORS.map((color) => ({
    color,
    cards: propertyCardsFor(player, color),
    rent: rentForColor(player, color),
    complete: completeSetColors(player).includes(color),
  })).filter((group) => group.cards.length > 0);
}

function paymentAssets(player: PlayerState): PaymentAsset[] {
  return [
    ...player.bank.map((card) => ({
      card,
      source: "bank" as const,
      label: `Bank - ${card.name}`,
    })),
    ...player.properties
      .filter((entry) => !entry.card.isMulticolor)
      .map((entry) => ({
        card: entry.card,
        source: "property" as const,
        label: `${colorName(entry.assignedColor)} - ${entry.card.name}`,
      })),
  ];
}

function setupGame(botCount: number, difficulty: BotDifficulty, pName: string, pAvatar: string): GameState {
  const players = [
    { id: "human", name: pName, avatar: pAvatar, isBot: false },
    ...Array.from({ length: botCount }, (_, index) => ({
      id: `bot-${index + 1}`,
      name: `${difficulty === "hard" ? "Tactical" : difficulty === "easy" ? "Casual" : "Steady"} Bot ${index + 1}`,
      avatar: ["🤖", "🧠", "⚡", "👾"][index % 4],
      isBot: true,
    })),
  ];

  return createInitialState({
    players,
    botCount,
    seed: Date.now() % 2147483647,
    houseRules: { orphanBuildingsToBank: true },
  });
}

function SetColumn({ group, small }: { group: ReturnType<typeof groupedProperties>[number]; small?: boolean }) {
  const maxNeeded = group.color === "railroad" ? 4 : group.color === "brown" || group.color === "dark-blue" || group.color === "utility" ? 2 : 3;
  const progress = Math.min(100, (group.cards.length / maxNeeded) * 100);

  return (
    <div
      className={cn(
        "rounded-xl border p-2 transition-all duration-300 relative bg-zinc-950/70 flex flex-col justify-between",
        group.complete
          ? "border-amber-400 bg-gradient-to-b from-zinc-950/70 to-amber-950/10 animate-gold-pulse"
          : "border-white/5 hover:border-white/10",
        small ? "min-w-[5.5rem] p-1.5" : "min-w-[7rem] p-2.5"
      )}
    >
      {group.complete && (
        <span className={cn(
          "absolute grid place-items-center rounded-full bg-amber-400 text-amber-950 font-black shadow-lg z-10 animate-bounce",
          small ? "-top-1.5 -right-1.5 h-4 w-4 text-[8px]" : "-top-2 -right-2 h-5 w-5 text-[10px]"
        )}>
          ★
        </span>
      )}
      <div>
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className={cn(
            "flex items-center gap-1 font-black uppercase text-zinc-300",
            small ? "text-[8.5px]" : "text-[10px]"
          )}>
            <span className={cn("rounded-full shadow-inner", small ? "h-2 w-2" : "h-2.5 w-2.5")} style={{ backgroundColor: propertyColorStyle(group.color) }} />
            {small ? colorName(group.color).slice(0, 4) + "." : colorName(group.color)}
          </span>
          <Badge variant={group.complete ? "default" : "secondary"} className={cn("px-1 py-0 font-mono leading-none border border-white/5", small ? "text-[8px] h-3.5" : "text-[9px] h-4.5", group.complete && "bg-amber-400 text-amber-950")}>
            {group.cards.length}
          </Badge>
        </div>
        <Progress value={progress} className={cn("h-1 bg-zinc-900", group.complete ? "bg-amber-400/20" : "")} />
      </div>
      
      <div className={cn("mt-2 flex overflow-visible py-0.5", small ? "-space-x-4.5" : "-space-x-6.5")}>
        {group.cards.map((entry, idx) => (
          <div key={entry.card.id} style={{ zIndex: idx, transform: `rotate(${(idx - (group.cards.length - 1) / 2) * 1.5}deg)` }}>
            <CardView card={entry.card} size={small ? "sm" : "md"} />
          </div>
        ))}
      </div>
      <p className={cn("mt-1.5 font-mono font-bold text-emerald-400 leading-none", small ? "text-[8.5px]" : "text-[10px]")}>Rent ${group.rent}M</p>
    </div>
  );
}

function PlayerPanel({ player, active, self }: { player: PlayerState; active: boolean; self?: boolean }) {
  const groups = groupedProperties(player);
  return (
    <motion.section
      layout
      className={cn(
        "rounded-xl border p-2.5 shadow-xl transition-all duration-300 relative",
        active
          ? "border-emerald-400/80 bg-zinc-900/40 shadow-emerald-500/5"
          : "border-white/5 bg-zinc-950/20",
        self && "bg-emerald-950/5 border-emerald-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "grid h-10 w-10 place-items-center rounded-full border bg-zinc-900 text-base font-black shadow-lg font-mono",
            active ? "border-emerald-400 text-emerald-300 animate-pulse" : "border-white/10 text-zinc-300"
          )}>
            {player.avatar}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-black text-zinc-100">{player.name}</p>
              {player.isBot && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-zinc-800 text-zinc-500 gap-0.5">
                  <Bot className="h-2.5 w-2.5" /> Bot
                </Badge>
              )}
            </div>
            <p className="font-mono text-[10px] text-zinc-400 mt-0.5">
              {player.hand.length} cards · ${bankTotal(player)}M bank · ${playerNetWorth(player)}M net worth
            </p>
          </div>
        </div>
        {active && (
          <Badge className="bg-emerald-400 text-emerald-950 font-bold border border-emerald-500/25 animate-pulse text-[10px]">
            ACTIVE TURN
          </Badge>
        )}
      </div>

      {/* Tableau cards rendering (wrapping layout, no horizontal scrollbars!) */}
      <div className="mt-2.5 flex flex-wrap gap-2 justify-start items-stretch">
        {/* Bank card views */}
        {player.bank.length > 0 && (
          <div className={cn(
            "rounded-xl border border-white/5 bg-zinc-950/80 p-2 text-center flex flex-col justify-between",
            self ? "min-w-[5rem]" : "min-w-[4.2rem]"
          )}>
            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Vault</span>
            <div className="my-1.5 flex justify-center -space-x-5 overflow-visible">
              {player.bank.slice(0, 4).map((card, idx) => (
                <div key={card.id} style={{ zIndex: idx, transform: `rotate(${(idx - 1.5) * 4}deg)` }}>
                  <CardView card={card} size={self ? "md" : "sm"} className="shadow" />
                </div>
              ))}
            </div>
            <p className="font-mono text-[11px] font-black text-amber-300">${bankTotal(player)}M</p>
          </div>
        )}

        {groups.map((group) => (
          <SetColumn key={group.color} group={group} small={!self} />
        ))}

        {groups.length === 0 && player.bank.length === 0 && (
          <p className="w-full py-6 text-center text-[11px] text-zinc-600 border border-dashed border-white/5 rounded-xl">
            Tableau is empty
          </p>
        )}
      </div>
    </motion.section>
  );
}

function RulesSheet() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" className="cursor-pointer font-semibold h-8 border-white/5" />}>
        <Info className="h-4 w-4" />
        Rules
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-zinc-950 text-zinc-50 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Monopoly Deal Rules</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="flow" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-white/5">
            <TabsTrigger value="flow" className="font-bold text-xs">Turn Flow</TabsTrigger>
            <TabsTrigger value="cards" className="font-bold text-xs">Card Types</TabsTrigger>
            <TabsTrigger value="nuances" className="font-bold text-xs">Table Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="flow" className="space-y-4 text-sm text-zinc-300 mt-4 leading-relaxed">
            <p>1. Draw 2 cards at start of your turn. If your hand is empty at turn start, draw 5 cards.</p>
            <p>2. Play up to 3 cards. You can play properties, add money to bank, or launch action attacks.</p>
            <p>3. End turn. If you hold more than 7 cards, you must discard the excess down to 7.</p>
            <p className="font-semibold text-emerald-400">First to complete 3 different color property sets wins!</p>
          </TabsContent>
          <TabsContent value="cards" className="space-y-4 text-sm text-zinc-300 mt-4 leading-relaxed">
            <p><strong>Property Cards</strong>: Place them in sets. Wildcards can be reassigned to complete sets.</p>
            <p><strong>Bank/Money</strong>: Any cash values or actions can be placed in your Vault. Action cards in bank act purely as money and can never be played as actions again.</p>
            <p><strong>Actions</strong>: Play to the center discard pile to trigger rent requests, steals, or swaps.</p>
            <p><strong>Just Say No</strong>: Play out of turn to cancel any action card targeted at you. Can be countered with another JSN!</p>
          </TabsContent>
          <TabsContent value="nuances" className="space-y-4 text-sm text-zinc-300 mt-4 leading-relaxed">
            <p><strong>No Change Given</strong>: If you owe rent and only have high-value cards, you must pay with them. Change is not refunded.</p>
            <p><strong>Short Payment</strong>: If you cannot afford rent, you must pay all available properties and bank money. Hand cards cannot be used to pay rent.</p>
            <p><strong>Orphan Buildings</strong>: If a property set is broken up, any houses/hotels collapse into bank money.</p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function GameClient() {
  const searchParams = useSearchParams();
  const pName = searchParams.get("name") ?? "You";
  const pAvatar = searchParams.get("avatar") ?? "😎";
  const initialBots = Math.max(1, Math.min(Number(searchParams.get("bots") ?? "2") || 2, 4));
  const initialDifficulty = (searchParams.get("difficulty") as BotDifficulty) ?? "normal";

  const [botCount, setBotCount] = useState(initialBots);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(initialDifficulty);
  const [state, setState] = useState<GameState>(() => setupGame(initialBots, initialDifficulty, pName, pAvatar));
  const [hydrated, setHydrated] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [muted, setMuted] = useState(false);
  const [activeBotMessage, setActiveBotMessage] = useState<string>("Click 'Draw Cards' to begin the match!");
  const [isLogOpen, setIsLogOpen] = useState(false);

  const human = state.players.find((player) => player.id === "human") ?? state.players[0];
  const current = state.players[state.currentPlayerIndex];
  const legalMoves = useMemo(() => getLegalMoves(state, human.id), [state, human.id]);
  const selectedCard = human.hand.find((card) => card.id === selectedCardId) ?? human.properties.find((entry) => entry.card.id === selectedCardId)?.card;
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
    (move: Move) => {
      try {
        const result = applyMove(state, move);
        setState(result.state);
        playEvents(result.events);
        setSelectedCardId(undefined);
        setSelectedPaymentIds([]);
        setMessage(undefined);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "That move is not legal right now");
      }
    },
    [playEvents, state],
  );

  const startNewGame = useCallback(
    (nextBots = botCount, nextDifficulty = difficulty) => {
      const nextState = setupGame(nextBots, nextDifficulty, pName, pAvatar);
      setState(nextState);
      setBotCount(nextBots);
      setDifficulty(nextDifficulty);
      setSelectedCardId(undefined);
      setSelectedPaymentIds([]);
      setMessage(undefined);
      setActiveBotMessage("Dealt fresh cards. Ready!");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, serialize(nextState));
      }
    },
    [botCount, difficulty, pName, pAvatar],
  );

  // Hydrate local save on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedMuted = window.localStorage.getItem("deal.muted") === "true";
    setMuted(savedMuted);

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const loadedState = deserialize(saved);
        const humanPlayer = loadedState.players.find((p) => p.id === "human");
        if (humanPlayer) {
          humanPlayer.name = pName;
          humanPlayer.avatar = pAvatar;
        }
        setState(loadedState);
        setHydrated(true);
        return;
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    const nextState = setupGame(initialBots, initialDifficulty, pName, pAvatar);
    setState(nextState);
    setHydrated(true);
  }, [initialBots, initialDifficulty, pName, pAvatar]);

  // Save changes locally
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serialize(state));
  }, [hydrated, state]);

  // Audio preference storage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("deal.muted", String(muted));
    }
  }, [muted]);

  // Confetti on win
  useEffect(() => {
    if (!winner) {
      return;
    }

    playSfx("win", muted);
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    const timer = window.setTimeout(() => confetti({ particleCount: 100, spread: 110, origin: { y: 0.3 } }), 300);
    return () => window.clearTimeout(timer);
  }, [muted, winner]);

  // Asynchronous Bot moves handling
  useEffect(() => {
    if (!hydrated || winner) {
      return;
    }

    let actingPlayerId: string | undefined;
    if (state.pendingInteraction?.kind === "payment") {
      actingPlayerId = state.pendingInteraction.debt.debtorId;
    } else if (state.pendingInteraction?.kind === "just_say_no") {
      actingPlayerId = state.pendingInteraction.currentResponderId;
    } else {
      actingPlayerId = current.id;
    }

    const actor = state.players.find((player) => player.id === actingPlayerId);
    if (!actor?.isBot) {
      // Clear message on player turn after brief status update
      if (current.id === "human" && !state.pendingInteraction) {
        setActiveBotMessage("🟢 Your turn to play cards!");
      }
      return;
    }

    setActiveBotMessage(`🤖 ${actor.name} is thinking...`);

    const timer = window.setTimeout(() => {
      setState((previous) => {
        const move = chooseBotMove(previous, actor.id, difficulty);
        if (!move) {
          setActiveBotMessage(`🤖 ${actor.name} passes.`);
          return previous;
        }

        try {
          const result = applyMove(previous, move);
          playEvents(result.events);
          
          const label = moveLabel(previous, move);
          setActiveBotMessage(`🤖 ${actor.name} played: ${label}`);
          return result.state;
        } catch {
          return previous;
        }
      });
    }, state.pendingInteraction ? 1200 : 1800); // stable step delays

    return () => window.clearTimeout(timer);
  }, [current.id, difficulty, hydrated, playEvents, state, winner]);

  // Auto-draw helper for player
  useEffect(() => {
    if (!hydrated || winner) {
      return;
    }

    if (current.id === "human" && drawMove) {
      const timer = window.setTimeout(() => {
        commitMove(drawMove);
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [current.id, drawMove, hydrated, winner, commitMove]);

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
  const canPay = pendingPayMove ? isMoveLegal(state, pendingPayMove) : false;

  const togglePayment = (cardId: string) => {
    setSelectedPaymentIds((currentIds) =>
      currentIds.includes(cardId) ? currentIds.filter((id) => id !== cardId) : [...currentIds, cardId],
    );
  };

  return (
    <main className="h-screen max-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.22)_0%,rgba(6,25,18,0.95)_70%),linear-gradient(to_bottom,#020704,#090e0c_50%,#11090f)] text-zinc-50 flex flex-col justify-between p-2.5 sm:p-3 select-none">
      <div className="flex flex-col gap-2.5 h-full justify-between">
        
        {/* POLISHED TABLEHEADER */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/45 px-4 py-2 backdrop-blur-xl shadow-lg shrink-0">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-zinc-100">DEAL!</h1>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 font-mono text-[9px] h-4.5 px-1 py-0 leading-none">
                  Round {state.turnNumber}
                </Badge>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">
                {winner ? `Winner: ${winner.name}` : `${current.name}'s active turn · ${state.phase.replace("_", " ")}`}
              </p>
            </div>
          </div>
          
          {/* TURN PLAYS AND CONTROLS */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge className="bg-zinc-950 text-zinc-200 border border-white/5 h-8 px-2.5 text-[11px] font-semibold gap-1">
              Plays Left:
              <span className="flex gap-0.5 ml-1 text-emerald-400 font-bold">
                {"●".repeat(state.playsRemaining)}
                <span className="text-zinc-700 font-normal">{"○".repeat(Math.max(0, 3 - state.playsRemaining))}</span>
              </span>
            </Badge>
            
            <Button variant="outline" size="sm" onClick={() => setMuted((v) => !v)} className="cursor-pointer h-8 border-white/5 text-zinc-300">
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
              <span className="hidden sm:inline">Sound</span>
            </Button>

            <Button variant="outline" size="sm" onClick={() => setIsLogOpen(true)} className="cursor-pointer h-8 border-white/5 text-zinc-300 gap-1.5 font-bold">
              <History className="h-4 w-4 text-emerald-400" />
              Log ({state.log.length})
            </Button>
            
            <RulesSheet />
            
            <Button variant="outline" size="sm" onClick={() => startNewGame()} className="cursor-pointer h-8 border-white/5 text-zinc-300 gap-1.5 font-semibold">
              <RefreshCw className="h-3.5 w-3.5" />
              Restart
            </Button>
            
            <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 gap-1.5 font-semibold text-zinc-300 border border-white/5 bg-zinc-900/50 hover:bg-zinc-900 cursor-pointer")}>
              <DoorOpen className="h-3.5 w-3.5" />
              Main Menu
            </Link>
          </div>
        </header>

        {/* FEEDBACK STATUS ALERTS */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-rose-500/20 bg-rose-950/20 px-4 py-2 text-xs text-rose-300 flex items-center gap-2 shrink-0"
          >
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            {message}
          </motion.div>
        )}

        {/* GAMEBOARD CONTAINER (strictly locked viewport layout) */}
        <section className="flex-1 min-h-0 grid grid-rows-[auto_1fr_auto] gap-2.5">
          
          {/* ROW 1: OPPONENTS (BOTS) */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
            {state.players
              .filter((player) => player.id !== human.id)
              .map((player) => (
                <PlayerPanel key={player.id} player={player} active={current.id === player.id} />
              ))}
          </div>

          {/* ROW 2: Felt table center */}
          <div className="flex-1 min-h-[160px] relative flex flex-col">
            {/* Casino felt table with mahogany chassis bezel */}
            <section className="relative overflow-hidden rounded-2xl border-[10px] border-zinc-950 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.18),rgba(5,20,15,0.92)_70%,rgba(3,8,6,0.98))] p-4 shadow-[inset_0_4px_25px_rgba(0,0,0,0.85),0_10px_35px_rgba(0,0,0,0.5)] flex-1 flex items-center justify-center">
              <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
              
              {/* Bot thinking/acting status marquee */}
              {activeBotMessage && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/20 bg-emerald-950/80 px-4 py-1.5 text-xs text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-pulse flex items-center gap-1.5 z-20 font-semibold tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {activeBotMessage}
                </div>
              )}

              {/* CENTER DECKS AND FLOAT BAR CONTROLS */}
              <div className="flex flex-col items-center justify-center gap-6 z-10">
                <div className="flex items-center gap-10 justify-center">
                  {/* DRAW PILE */}
                  <div className="text-center flex flex-col items-center">
                    <div className="relative group">
                      <div className="absolute inset-0 bg-emerald-500/10 rounded-xl blur-md group-hover:bg-emerald-500/20 transition duration-300" />
                      <CardView faceDown size="md" className="border border-emerald-500/20 relative shadow-2xl" />
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-7 place-items-center rounded bg-zinc-950 border border-white/10 text-[10px] font-black font-mono">
                        {state.deck.length}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] uppercase font-black text-zinc-400 tracking-wider">Draw Deck</p>
                  </div>

                  {/* DISCARD PILE */}
                  <div className="text-center flex flex-col items-center">
                    <div className="relative">
                      {state.discard.at(-1) ? (
                        <>
                          <CardView card={state.discard.at(-1)} size="md" className="shadow-2xl relative" />
                          <span className="absolute -bottom-1 -right-1 grid h-5 w-7 place-items-center rounded bg-zinc-950 border border-white/10 text-[10px] font-black font-mono">
                            {state.discard.length}
                          </span>
                        </>
                      ) : (
                        <div className="grid h-32 w-23 place-items-center rounded-lg border-2 border-dashed border-white/10 text-[10px] font-black uppercase text-zinc-600 bg-black/20">
                          Empty
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-[9px] uppercase font-black text-zinc-400 tracking-wider">Discard</p>
                  </div>
                </div>

                {/* Floating Turn Action Controls */}
                <div className="flex gap-2.5 bg-black/55 border border-white/10 p-2 rounded-xl shadow-2xl backdrop-blur-xl">
                  {drawMove && (
                    <Button size="default" onClick={() => commitMove(drawMove)} className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black gap-2 shadow-[0_0_15px_rgba(16,185,129,0.35)] cursor-pointer h-9 px-4 text-xs">
                      <Play className="h-4 w-4 fill-current" />
                      Draw Cards
                    </Button>
                  )}
                  
                  {endTurnMove && (
                    <Button variant="secondary" size="default" onClick={() => commitMove(endTurnMove)} className="border border-white/5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 font-black gap-1.5 cursor-pointer h-9 px-4 text-xs">
                      <Check className="h-4 w-4 text-emerald-400" />
                      End Turn
                    </Button>
                  )}
                  
                  {discardMove && (
                    <Button variant="destructive" size="default" onClick={() => commitMove(discardMove)} className="font-black gap-1.5 cursor-pointer h-9 px-4 text-xs">
                      <ClipboardList className="h-4 w-4" />
                      Auto Discard
                    </Button>
                  )}

                  {!drawMove && !endTurnMove && !discardMove && (
                    <div className="px-4 py-2 text-[10px] font-black text-zinc-400 tracking-wider uppercase">
                      {state.pendingInteraction ? "Awaiting Response" : "Opponents Playing..."}
                    </div>
                  )}
                </div>
              </div>

              {/* PENDING INTERACTION FLOATING OVERLAY */}
              <AnimatePresence>
                {state.pendingInteraction && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-4"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 15 }}
                      className="bg-zinc-950/95 border border-emerald-500/20 p-5 rounded-2xl max-w-xs w-full text-center flex flex-col items-center shadow-[0_0_50px_rgba(16,185,129,0.25)]"
                    >
                      <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2.5 uppercase text-[9px] tracking-wider font-extrabold px-2 py-0.5">
                        Active Action card
                      </Badge>
                      
                      {state.discard.at(-1) && (
                        <div className="my-1">
                          <CardView card={state.discard.at(-1)} size="md" className="shadow-[0_15px_30px_rgba(0,0,0,0.6)] border-amber-400/15" />
                        </div>
                      )}
                      
                      <h3 className="text-xs font-black text-zinc-100 mt-2 leading-snug">
                        {state.pendingInteraction.kind === "payment"
                          ? `Pay $${state.pendingInteraction.debt.amount}M rent to ${playerName(state, state.pendingInteraction.debt.creditorId)}`
                          : `${playerName(state, state.pendingInteraction.effect.actorId)} targeted you`}
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">
                        {state.pendingInteraction.kind === "payment"
                          ? "Select vault cash or properties below to pay."
                          : "Counter with a Just Say No card or allow it."}
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          {/* ROW 3: USER HAND */}
          <section className="rounded-2xl border border-white/5 bg-black/20 p-3.5 shadow-2xl backdrop-blur-xl shrink-0">
            <PlayerPanel player={human} active={current.id === human.id} self />
            <Separator className="my-3 bg-white/5" />
            
            {/* Hand view */}
            <div className="overflow-x-auto pb-1.5 scrollbar-thin">
              <div className="flex min-h-[13rem] items-end gap-2 px-1 justify-center">
                <AnimatePresence initial={false}>
                  {human.hand.map((card, index) => {
                    const offset = index - (human.hand.length - 1) / 2;
                    const rot = offset * 1.5;
                    return (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 45, rotate: 5 }}
                        animate={{ opacity: 1, y: 0, rotate: rot }}
                        exit={{ opacity: 0, y: 45 }}
                        transition={{ type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <CardView
                          card={card}
                          selected={selectedCardId === card.id}
                          disabled={current.id !== human.id && state.pendingInteraction?.kind !== "just_say_no"}
                          onClick={() => setSelectedCardId(card.id)}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                
                {human.hand.length === 0 && (
                  <div className="grid h-36 w-full place-items-center rounded-xl border border-dashed border-white/10 text-xs font-semibold text-zinc-500 bg-black/10">
                    Your hand is empty. Drawing cards automatically...
                  </div>
                )}
              </div>
            </div>

            {/* FLOATING CARD INSPECTOR PANEL (overlaps bottom center when card is selected) */}
            <AnimatePresence>
              {selectedCard && (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-950/95 border border-emerald-500/25 p-4 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.85)] max-w-sm w-[calc(100%-2.5rem)] flex gap-4 items-center backdrop-blur-xl"
                >
                  <div className="shrink-0">
                    <CardView card={selectedCard} size="md" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between h-full min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <h3 className="font-black text-sm text-zinc-100 truncate">{selectedCard.name}</h3>
                        <button onClick={() => setSelectedCardId(undefined)} className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200 shrink-0 cursor-pointer">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                        {selectedCard.kind === "money"
                          ? "Vault currency. Bank it to protect property sets from rent collections."
                          : selectedCard.kind === "property"
                          ? "Place on board. Form completed color groups to win."
                          : "Launches rent requests, blocks opponent attacks, or sweeps property sets."}
                      </p>
                    </div>
                    
                    <div className="grid gap-1.5 mt-3">
                      {selectedMoves.map((move, index) => (
                        <Button key={`${move.type}-${index}`} size="sm" className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-8" onClick={() => commitMove(move)}>
                          {moveLabel(state, move)}
                        </Button>
                      ))}
                      {selectedMoves.length === 0 && (
                        <p className="text-[9px] text-zinc-500 italic bg-black/25 p-1.5 rounded text-center">
                          No actions available in this turn phase.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </section>
      </div>

      {/* POPUP: PAYMENT DUE MODAL */}
      <Dialog open={Boolean(pendingPayment)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/5 bg-zinc-950 text-zinc-50 sm:max-w-xl shadow-2xl backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <CreditCard className="h-5 w-5 text-emerald-400" />
              Payment Requested
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              You owe <strong>${pendingPayment?.debt.amount ?? 0}M</strong> in rent/fees to <strong>{pendingPayment ? playerName(state, pendingPayment.debt.creditorId) : ""}</strong>. No change is returned.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
            {assets.map((asset) => (
              <button
                key={asset.card.id}
                type="button"
                onClick={() => togglePayment(asset.card.id)}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition relative cursor-pointer select-none",
                  selectedPaymentIds.includes(asset.card.id)
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-white/5 bg-black/20 hover:border-white/10",
                )}
              >
                {selectedPaymentIds.includes(asset.card.id) && (
                  <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 grid place-items-center text-zinc-950 text-[9px] font-black">
                    ✓
                  </span>
                )}
                <p className="text-xs font-bold text-zinc-200 line-clamp-1">{asset.label}</p>
                <p className="font-mono text-[10px] text-zinc-400 mt-1">${asset.card.value}M · {asset.source}</p>
              </button>
            ))}
            {assets.length === 0 && (
              <p className="text-xs text-zinc-500 py-6 text-center border border-dashed border-white/5 rounded-lg col-span-2">
                You have zero payable assets. Your turn will skip payment.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/40 p-3 mt-1.5">
            <div>
              <p className="text-xs font-bold text-zinc-200 font-mono">Paying: ${selectedPaymentTotal}M / ${pendingPayment?.debt.amount ?? 0}M</p>
              <p className="text-[9px] text-zinc-500 mt-0.5 font-medium">Select assets from your tableau and vault.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer text-xs font-semibold"
                onClick={() => pendingPayment && setSelectedPaymentIds(chooseAutoPayment(human, pendingPayment.debt.amount))}
              >
                Auto-Select
              </Button>
              <Button
                size="sm"
                className="cursor-pointer text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                disabled={!canPay || !pendingPayMove}
                onClick={() => pendingPayMove && commitMove(pendingPayMove)}
              >
                Commit Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* POPUP: JUST SAY NO CHAIN BLOCK MODAL */}
      <Dialog open={Boolean(pendingJsn)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/5 bg-zinc-950 text-zinc-50 sm:max-w-md shadow-2xl backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <Shield className="h-5 w-5 text-emerald-400" />
              Counter Targeted Action?
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              <strong>{pendingJsn ? playerName(state, pendingJsn.effect.actorId) : "An opponent"}</strong> targeted you with an action card. You can block it if you hold a Just Say No.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {legalMoves
              .filter((move) => move.type === "respond_jsn")
              .map((move, index) => (
                <Button
                  key={index}
                  variant={move.type === "respond_jsn" && move.useCardId ? "default" : "secondary"}
                  className="cursor-pointer font-bold justify-start"
                  onClick={() => commitMove(move)}
                >
                  {move.type === "respond_jsn" && move.useCardId ? <Shield className="h-4 w-4 mr-2 text-emerald-300" /> : <Check className="h-4 w-4 mr-2" />}
                  {moveLabel(state, move)}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* POPUP: GAME OVER WINNER ANNOUNCEMENT */}
      <Dialog open={Boolean(winner)} onOpenChange={() => undefined}>
        <DialogContent className="border-amber-400/20 bg-zinc-950 text-zinc-50 sm:max-w-md shadow-2xl backdrop-blur-2xl text-center">
          <DialogHeader className="items-center">
            <div className="h-14 w-14 rounded-full bg-amber-500/10 border border-amber-500/30 grid place-items-center mb-2">
              <Sparkles className="h-7 w-7 text-amber-300 animate-pulse" />
            </div>
            <DialogTitle className="text-2xl font-black text-zinc-100">
              {winner?.name} Wins the Deal!
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Completed 3 full property sets first!
            </DialogDescription>
          </DialogHeader>
          
          {winner && (
            <div className="my-4 flex flex-col gap-2 items-center">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Winning Sets</p>
              <div className="flex gap-2.5 overflow-x-auto justify-center py-2">
                {completeSetColors(winner).slice(0, 3).map((color) => (
                  <div key={color} className="rounded-xl border border-white/5 bg-zinc-900/40 p-2.5 min-w-24 text-center">
                    <span className="mb-2 block h-1.5 rounded-full" style={{ backgroundColor: propertyColorStyle(color) }} />
                    <p className="text-xs font-black text-zinc-200">{colorName(color)}</p>
                    <p className="font-mono text-[10px] text-zinc-400 mt-1">Rent ${rentForColor(winner, color)}M</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-2 mt-4 justify-center w-full">
            <Button onClick={() => startNewGame()} className="cursor-pointer font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex-1 h-10">
              <RefreshCw className="h-4 w-4 mr-2" />
              Rematch Play
            </Button>
            <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "flex-1 h-10 font-bold cursor-pointer border border-white/5")}>
              Back to Menu
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETACHED COLLAPSIBLE ACTION LOG SHEET */}
      <Sheet open={isLogOpen} onOpenChange={setIsLogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-zinc-950/95 border-white/5 text-zinc-50 flex flex-col h-full shadow-2xl backdrop-blur-2xl">
          <SheetHeader className="border-b border-white/5 pb-3.5 flex flex-row items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-zinc-100">
              <History className="h-4 w-4 text-emerald-400" />
              Live Action Log
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4 pr-1.5">
            <div className="space-y-2">
              {[...state.log].reverse().map((event) => (
                <div key={event.id} className="rounded-lg border border-white/5 bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-300 leading-relaxed font-medium">
                  {event.message}
                </div>
              ))}
              {state.log.length === 0 && (
                <p className="py-12 text-center text-xs text-zinc-600 font-medium">
                  No turns logged yet. Deal to start!
                </p>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <div className="fixed bottom-3 right-3 hidden rounded-full border border-white/5 bg-zinc-950/80 px-3 py-1.5 text-[10px] text-zinc-500 backdrop-blur-xl sm:block font-mono">
        {hydrated ? "● local storage sync active" : "○ sync loading"}
      </div>
    </main>
  );
}
