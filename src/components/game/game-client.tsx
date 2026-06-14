"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Crown,
  DoorOpen,
  Hand,
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
  AlertTriangle,
  Zap,
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
  if ("cardId" in move) return move.cardId;
  return undefined;
}

function moveUsesSelected(move: Move, selectedCardId: string): boolean {
  return moveCardId(move) === selectedCardId || ("doubleRentCardId" in move && move.doubleRentCardId === selectedCardId);
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function colorName(color: PropertyColor): string {
  return color.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

function moveLabel(state: GameState, move: Move): string {
  if (move.type === "play_to_bank")      return "Bank for Money";
  if (move.type === "play_property")     return `Play to ${colorName(move.assignedColor)}`;
  if (move.type === "reassign_wild")     return `Reassign to ${colorName(move.assignedColor)}`;
  if (move.type === "play_pass_go")      return "Draw 2 Cards";
  if (move.type === "play_house")        return `Build House on ${colorName(move.color)}`;
  if (move.type === "play_hotel")        return `Build Hotel on ${colorName(move.color)}`;
  if (move.type === "play_rent") {
    const target = move.targetId ? ` from ${playerName(state, move.targetId)}` : " from everyone";
    return `${move.doubleRentCardId ? "Double " : ""}${colorName(move.color)} Rent${target}`;
  }
  if (move.type === "play_debt_collector")  return `Collect $5M from ${playerName(state, move.targetId)}`;
  if (move.type === "play_birthday")        return "Collect $2M from everyone";
  if (move.type === "play_sly_deal")        return `Take property from ${playerName(state, move.targetId)}`;
  if (move.type === "play_forced_deal")     return `Swap with ${playerName(state, move.targetId)}`;
  if (move.type === "play_deal_breaker")    return `Sweep ${playerName(state, move.targetId)}'s ${colorName(move.color)} set`;
  if (move.type === "end_turn")  return "End turn";
  if (move.type === "draw")      return "Draw";
  if (move.type === "discard")   return "Discard selected";
  if (move.type === "respond_jsn") return move.useCardId ? "Block with Just Say No" : "Allow Action";
  return "Play Card";
}

function eventToSfx(event: GameEvent): "draw" | "place" | "money" | "steal" | "no" | "turn" | "win" {
  if (event.type === "draw")    return "draw";
  if (event.type === "payment" || event.type === "rent" || event.type === "bank") return "money";
  if (event.type === "steal" || event.type === "swap") return "steal";
  if (event.type === "jsn")     return "no";
  if (event.type === "turn")    return "turn";
  if (event.type === "win")     return "win";
  return "place";
}

function groupedProperties(player: PlayerState): { color: PropertyColor; cards: TableauCard[]; rent: number; complete: boolean }[] {
  return PROPERTY_COLORS.map((color) => ({
    color,
    cards: propertyCardsFor(player, color),
    rent:  rentForColor(player, color),
    complete: completeSetColors(player).includes(color),
  })).filter((g) => g.cards.length > 0);
}

function paymentAssets(player: PlayerState): PaymentAsset[] {
  return [
    ...player.bank.map((card) => ({ card, source: "bank" as const, label: `Bank — ${card.name}` })),
    ...player.properties
      .filter((e) => !e.card.isMulticolor)
      .map((e) => ({ card: e.card, source: "property" as const, label: `${colorName(e.assignedColor)} — ${e.card.name}` })),
  ];
}

function setupGame(botCount: number, difficulty: BotDifficulty, pName: string, pAvatar: string): GameState {
  const players = [
    { id: "human", name: pName, avatar: pAvatar, isBot: false },
    ...Array.from({ length: botCount }, (_, i) => ({
      id: `bot-${i + 1}`,
      name: `${difficulty === "hard" ? "Tactical" : difficulty === "easy" ? "Casual" : "Steady"} Bot ${i + 1}`,
      avatar: ["🤖", "🧠", "⚡", "👾"][i % 4],
      isBot: true,
    })),
  ];
  return createInitialState({ players, botCount, seed: Date.now() % 2147483647, houseRules: { orphanBuildingsToBank: true } });
}

/* ─── Play Chips: visual indicator of plays remaining ─── */
function PlaysRemaining({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Plays</span>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => {
          const used = i >= count;
          return (
            <div
              key={i}
              className={cn(
                "h-4 w-4 rounded-full border-2 transition-all duration-300",
                used
                  ? "border-zinc-700/40 bg-zinc-800/30 opacity-30"
                  : "border-emerald-400/70 bg-emerald-500/20 animate-chip-active shadow-[0_0_6px_rgba(52,211,153,0.35)]"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Bot Thinking Indicator ─── */
function BotThinkingBubble({ message }: { message: string }) {
  const isBot     = message.startsWith("🤖");
  const isYourTurn = message.includes("Your turn");

  return (
    <div className={cn(
      "absolute top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-wide z-20 border transition-all duration-300",
      isYourTurn
        ? "border-emerald-400/30 bg-emerald-950/90 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.25)] animate-btn-glow"
        : "border-zinc-700/50 bg-zinc-950/85 text-zinc-300 shadow-lg"
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
      <span className="truncate max-w-[240px]">{message}</span>
      {isBot && (
        <span className="flex gap-0.5 shrink-0">
          <span className="h-1 w-1 rounded-full bg-zinc-400 dot-1" />
          <span className="h-1 w-1 rounded-full bg-zinc-400 dot-2" />
          <span className="h-1 w-1 rounded-full bg-zinc-400 dot-3" />
        </span>
      )}
    </div>
  );
}

/* ─── Property Set Column ─── */
function SetColumn({ group, small }: { group: ReturnType<typeof groupedProperties>[number]; small?: boolean }) {
  const maxNeeded = group.color === "railroad" ? 4 : (group.color === "brown" || group.color === "dark-blue" || group.color === "utility") ? 2 : 3;
  const progress  = Math.min(100, (group.cards.length / maxNeeded) * 100);

  return (
    <div
      className={cn(
        "rounded-xl border p-2 transition-all duration-300 relative bg-zinc-950/70 flex flex-col justify-between",
        group.complete
          ? "border-amber-400/70 bg-gradient-to-b from-zinc-950/70 to-amber-950/15 animate-gold-pulse"
          : "border-white/6 hover:border-white/12",
        small ? "min-w-[5.5rem] p-1.5" : "min-w-[7rem] p-2.5"
      )}
    >
      {group.complete && (
        <span className={cn(
          "absolute grid place-items-center rounded-full bg-amber-400 text-amber-950 font-black shadow-lg z-10 animate-star-bounce",
          small ? "-top-1.5 -right-1.5 h-4 w-4 text-[8px]" : "-top-2 -right-2 h-5 w-5 text-[10px]"
        )}>
          ★
        </span>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className={cn("flex items-center gap-1 font-black uppercase text-zinc-300", small ? "text-[8.5px]" : "text-[10px]")}>
            <span
              className={cn("rounded-full shadow-inner", small ? "h-2 w-2" : "h-2.5 w-2.5")}
              style={{ backgroundColor: propertyColorStyle(group.color) }}
            />
            {small ? colorName(group.color).slice(0, 4) + "." : colorName(group.color)}
          </span>
          <Badge
            variant={group.complete ? "default" : "secondary"}
            className={cn("px-1 py-0 font-mono leading-none border border-white/5", small ? "text-[8px] h-3.5" : "text-[9px] h-4.5", group.complete && "bg-amber-400 text-amber-950")}
          >
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

/* ─── Bot Tableau Dialog ─── */
function BotTableauDialog({ player, open, onClose }: { player?: PlayerState; open: boolean; onClose: () => void }) {
  if (!player) return null;
  const groups = groupedProperties(player);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-white/8 bg-zinc-950 text-zinc-50 sm:max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-white/5 pb-3">
          <DialogTitle className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-zinc-900 font-mono text-base font-black">
              {player.avatar}
            </span>
            <div>
              <p className="text-base font-black text-zinc-100">{player.name}&apos;s Tableau</p>
              <p className="font-mono text-xs text-zinc-400 mt-0.5">
                {player.hand.length} cards · ${bankTotal(player)}M bank · ${playerNetWorth(player)}M net worth
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-3 mt-4 justify-start items-stretch">
          {player.bank.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-zinc-950/80 p-3.5 text-center flex flex-col justify-between min-w-[5.5rem]">
              <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Vault</span>
              <div className="my-2.5 flex justify-center -space-x-5 overflow-visible">
                {player.bank.slice(0, 5).map((card) => (
                  <CardView key={card.id} card={card} size="sm" className="shadow border-white/5" />
                ))}
              </div>
              <p className="font-mono text-xs font-black text-amber-300">${bankTotal(player)}M</p>
            </div>
          )}
          {groups.map((group) => (
            <SetColumn key={group.color} group={group} small={false} />
          ))}
          {groups.length === 0 && player.bank.length === 0 && (
            <p className="w-full py-12 text-center text-xs text-zinc-600 border border-dashed border-white/5 rounded-xl">
              Tableau is empty
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Compact Bot Portrait Panel ─── */
function BotCompactPanel({ player, active, onClick }: { player: PlayerState; active: boolean; onClick: () => void }) {
  const groups       = groupedProperties(player);
  const completeSets = completeSetColors(player).length;
  const isMatchPoint = completeSets === 2;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border p-2 transition-all duration-300 relative flex flex-col justify-between h-[82px] cursor-pointer select-none",
        isMatchPoint
          ? "border-rose-500/60 bg-rose-950/15 shadow-[0_0_18px_rgba(239,68,68,0.3)] ring-1 ring-rose-500/25 animate-match-ring"
          : active
          ? "border-emerald-400/70 bg-zinc-900/50 animate-turn-glow ring-1 ring-emerald-500/20"
          : "border-white/6 bg-zinc-950/30 hover:bg-white/[0.02]"
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "grid h-7 w-7 place-items-center rounded-full border bg-zinc-900 text-xs font-black shadow font-mono relative",
            isMatchPoint ? "border-rose-400 text-rose-300" :
            active        ? "border-emerald-400 text-emerald-300" :
                           "border-white/10 text-zinc-300"
          )}>
            {player.avatar}
            {active && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-zinc-900 animate-ping" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-zinc-100 truncate leading-none">{player.name}</p>
            <p className="font-mono text-[9px] text-zinc-400 mt-1 leading-none">
              {player.hand.length} cards · ${bankTotal(player)}M
            </p>
          </div>
        </div>

        {completeSets > 0 && (
          <Badge className={cn(
            "font-bold px-1.5 py-0 h-4 border text-[9px] shrink-0",
            isMatchPoint
              ? "bg-rose-600 hover:bg-rose-600 text-rose-50 border-rose-500/30 animate-pulse"
              : "bg-amber-400 hover:bg-amber-400 text-amber-950 border-amber-500/20"
          )}>
            {isMatchPoint ? "⚠ MATCH PT" : `★ ${completeSets}`}
          </Badge>
        )}
      </div>

      {/* Property color chips */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none py-0.5 items-center">
        {groups.map((group) => (
          <span
            key={group.color}
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase text-zinc-950 leading-none shrink-0 border border-black/10 shadow-xs",
              group.complete ? "ring-1 ring-amber-400" : ""
            )}
            style={{
              backgroundColor: propertyColorStyle(group.color),
              color: (group.color === "yellow" || group.color === "light-blue") ? "#090e0c" : "#ffffff",
            }}
          >
            {group.cards.length}
          </span>
        ))}
        {groups.length === 0 && (
          <span className="text-[9px] text-zinc-600 font-medium italic">No properties</span>
        )}
      </div>
    </div>
  );
}

/* ─── Rules Sheet ─── */
function RulesSheet() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" className="cursor-pointer font-semibold h-8 border-white/8 gap-1.5" />}>
        <Info className="h-3.5 w-3.5" />
        Rules
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-zinc-950 text-zinc-50 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Monopoly Deal Rules</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="flow" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-white/5">
            <TabsTrigger value="flow"    className="font-bold text-xs">Turn Flow</TabsTrigger>
            <TabsTrigger value="cards"   className="font-bold text-xs">Card Types</TabsTrigger>
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
            <p><strong>Bank/Money</strong>: Any cash values or actions can be placed in your Vault. Action cards in bank act purely as money.</p>
            <p><strong>Actions</strong>: Play to discard pile to trigger rent requests, steals, or swaps.</p>
            <p><strong>Just Say No</strong>: Play out of turn to cancel any action card targeted at you. Can be countered!</p>
          </TabsContent>
          <TabsContent value="nuances" className="space-y-4 text-sm text-zinc-300 mt-4 leading-relaxed">
            <p><strong>No Change Given</strong>: If you owe rent and only have high-value cards, pay with them. Change is not refunded.</p>
            <p><strong>Short Payment</strong>: If you cannot afford rent, pay all available properties and bank money.</p>
            <p><strong>Orphan Buildings</strong>: If a property set is broken up, any houses/hotels collapse into bank money.</p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════
   MAIN GAME CLIENT
   ══════════════════════════════════════════════ */
export function GameClient() {
  const searchParams     = useSearchParams();
  const pName            = searchParams.get("name")   ?? "You";
  const pAvatar          = searchParams.get("avatar") ?? "😎";
  const initialBots      = Math.max(1, Math.min(Number(searchParams.get("bots") ?? "2") || 2, 4));
  const initialDifficulty = (searchParams.get("difficulty") as BotDifficulty) ?? "normal";

  const [botCount,           setBotCount]           = useState(initialBots);
  const [difficulty,         setDifficulty]         = useState<BotDifficulty>(initialDifficulty);
  const [state,              setState]              = useState<GameState>(() => setupGame(initialBots, initialDifficulty, pName, pAvatar));
  const [hydrated,           setHydrated]           = useState(false);
  const [selectedCardId,     setSelectedCardId]     = useState<string>();
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [message,            setMessage]            = useState<string>();
  const [muted,              setMuted]              = useState(false);
  const [activeBotMessage,   setActiveBotMessage]   = useState<string>("Click 'Draw Cards' to begin!");
  const [isLogOpen,          setIsLogOpen]          = useState(false);
  const [inspectPlayer,      setInspectPlayer]      = useState<PlayerState | null>(null);
  const [isMobile,           setIsMobile]           = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const human        = state.players.find((p) => p.id === "human") ?? state.players[0];
  const current      = state.players[state.currentPlayerIndex];
  const legalMoves   = useMemo(() => getLegalMoves(state, human.id), [state, human.id]);
  const selectedCard = human.hand.find((c) => c.id === selectedCardId) ?? human.properties.find((e) => e.card.id === selectedCardId)?.card;
  const selectedMoves = selectedCardId ? legalMoves.filter((m) => moveUsesSelected(m, selectedCardId)) : [];
  const drawMove      = legalMoves.find((m) => m.type === "draw");
  const endTurnMove   = legalMoves.find((m) => m.type === "end_turn");
  const discardMove   = legalMoves.find((m) => m.type === "discard");
  const winner        = state.winnerId ? state.players.find((p) => p.id === state.winnerId) : undefined;

  const isMyTurn   = current.id === "human" && !state.pendingInteraction;
  const humanSets  = completeSetColors(human).length;
  const isMatchPt  = humanSets === 2;

  const playEvents = useCallback((events: GameEvent[]) => {
    for (const ev of events) playSfx(eventToSfx(ev), muted);
  }, [muted]);

  const commitMove = useCallback((move: Move) => {
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
  }, [playEvents, state]);

  const startNewGame = useCallback((nextBots = botCount, nextDifficulty = difficulty) => {
    const nextState = setupGame(nextBots, nextDifficulty, pName, pAvatar);
    setState(nextState);
    setBotCount(nextBots);
    setDifficulty(nextDifficulty);
    setSelectedCardId(undefined);
    setSelectedPaymentIds([]);
    setMessage(undefined);
    setActiveBotMessage("Fresh cards dealt!");
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, serialize(nextState));
  }, [botCount, difficulty, pName, pAvatar]);

  /* Hydrate from localStorage */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedMuted = window.localStorage.getItem("deal.muted") === "true";
    setMuted(savedMuted);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const loaded = deserialize(saved);
        const hp = loaded.players.find((p) => p.id === "human");
        if (hp) { hp.name = pName; hp.avatar = pAvatar; }
        setState(loaded);
        setHydrated(true);
        return;
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setState(setupGame(initialBots, initialDifficulty, pName, pAvatar));
    setHydrated(true);
  }, [initialBots, initialDifficulty, pName, pAvatar]);

  /* Persist state */
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, serialize(state));
  }, [hydrated, state]);

  /* Persist mute pref */
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("deal.muted", String(muted));
  }, [muted]);

  /* Confetti on win */
  useEffect(() => {
    if (!winner) return;
    playSfx("win", muted);
    confetti({ particleCount: 180, spread: 85, origin: { y: 0.55 }, colors: ["#f59e0b", "#10b981", "#3b82f6", "#d946ef"] });
    const t1 = window.setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { y: 0.25 } }), 350);
    const t2 = window.setTimeout(() => confetti({ particleCount: 80,  spread: 60,  origin: { y: 0.7 }, angle: 60  }), 600);
    const t3 = window.setTimeout(() => confetti({ particleCount: 80,  spread: 60,  origin: { y: 0.7 }, angle: 120 }), 600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [muted, winner]);

  /* Bot moves */
  useEffect(() => {
    if (!hydrated || winner) return;
    let actorId: string | undefined;
    if (state.pendingInteraction?.kind === "payment") actorId = state.pendingInteraction.debt.debtorId;
    else if (state.pendingInteraction?.kind === "just_say_no") actorId = state.pendingInteraction.currentResponderId;
    else actorId = current.id;
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor?.isBot) {
      if (current.id === "human" && !state.pendingInteraction) setActiveBotMessage("🟢 Your turn to play!");
      return;
    }
    setActiveBotMessage(`🤖 ${actor.name} is thinking...`);
    const timer = window.setTimeout(() => {
      setState((prev) => {
        const move = chooseBotMove(prev, actor.id, difficulty);
        if (!move) { setActiveBotMessage(`🤖 ${actor.name} passes.`); return prev; }
        try {
          const result = applyMove(prev, move);
          playEvents(result.events);
          setActiveBotMessage(`🤖 ${actor.name}: ${moveLabel(prev, move)}`);
          return result.state;
        } catch { return prev; }
      });
    }, state.pendingInteraction ? 1200 : 1800);
    return () => window.clearTimeout(timer);
  }, [current.id, difficulty, hydrated, playEvents, state, winner]);

  /* Auto-draw for player */
  useEffect(() => {
    if (!hydrated || winner) return;
    if (current.id === "human" && drawMove) {
      const timer = window.setTimeout(() => commitMove(drawMove), 700);
      return () => window.clearTimeout(timer);
    }
  }, [current.id, drawMove, hydrated, winner, commitMove]);

  const pendingPayment  = state.pendingInteraction?.kind === "payment" && state.pendingInteraction.debt.debtorId === human.id
    ? state.pendingInteraction : undefined;
  const pendingJsn      = state.pendingInteraction?.kind === "just_say_no" && state.pendingInteraction.currentResponderId === human.id
    ? state.pendingInteraction : undefined;
  const assets          = paymentAssets(human);
  const selectedPayTotal = assets.filter((a) => selectedPaymentIds.includes(a.card.id)).reduce((s, a) => s + a.card.value, 0);
  const pendingPayMove: Move | undefined = pendingPayment ? { type: "pay", playerId: human.id, cardIds: selectedPaymentIds } : undefined;
  const canPay = pendingPayMove ? isMoveLegal(state, pendingPayMove) : false;

  const togglePayment = (cardId: string) =>
    setSelectedPaymentIds((ids) => ids.includes(cardId) ? ids.filter((id) => id !== cardId) : [...ids, cardId]);

  const humanGroups = groupedProperties(human);

  return (
    <main className="h-screen max-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.24)_0%,rgba(6,25,18,0.95)_65%),linear-gradient(to_bottom,#020704,#090e0c_50%,#11090f)] text-zinc-50 flex flex-col justify-between p-2 sm:p-3 select-none">
      <div className="flex flex-col gap-2 h-full justify-between">

        {/* ══ HEADER BAR ══ */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/50 px-4 py-2 backdrop-blur-xl shadow-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/12 border border-amber-500/25">
              <Crown className="h-4.5 w-4.5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-black tracking-tight text-zinc-100">DEAL!</h1>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 font-mono text-[9px] h-4.5 px-1.5 leading-none">
                  Round {state.turnNumber}
                </Badge>
                {isMatchPt && (
                  <Badge className="bg-amber-400 text-amber-950 font-black text-[9px] h-4.5 px-1.5 leading-none border-0 animate-pulse">
                    ★ MATCH POINT
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-semibold leading-none">
                {winner ? `Winner: ${winner.name}` : `${current.name}'s turn · ${state.phase.replace("_", " ")}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Animated play chips */}
            <div className="flex items-center gap-2 rounded-lg border border-white/6 bg-zinc-950/60 px-3 h-8">
              <PlaysRemaining count={state.playsRemaining} />
            </div>

            <Button variant="outline" size="sm" onClick={() => setMuted((v) => !v)} className="cursor-pointer h-8 border-white/8 gap-1.5">
              {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
              <span className="hidden sm:inline text-xs">{muted ? "Muted" : "Sound"}</span>
            </Button>

            <Button variant="outline" size="sm" onClick={() => setIsLogOpen(true)} className="cursor-pointer h-8 border-white/8 gap-1.5 font-bold">
              <History className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline text-xs">Log ({state.log.length})</span>
            </Button>

            <RulesSheet />

            <Button variant="outline" size="sm" onClick={() => startNewGame()} className="cursor-pointer h-8 border-white/8 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Restart</span>
            </Button>

            <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 gap-1.5 font-semibold text-zinc-300 border border-white/6 bg-zinc-900/60 hover:bg-zinc-800 cursor-pointer")}>
              <DoorOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Menu</span>
            </Link>
          </div>
        </header>

        {/* ══ ERROR MESSAGE ══ */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              className="rounded-xl border border-rose-500/25 bg-rose-950/25 px-4 py-2 text-[11px] text-rose-300 flex items-center gap-2 shrink-0"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 animate-pulse" />
              {message}
              <button onClick={() => setMessage(undefined)} className="ml-auto text-rose-500 hover:text-rose-300 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ 3-LAYER BOARD ══ */}
        <section className="flex-1 min-h-0 flex flex-col gap-2 justify-between">

          {/* LAYER 1: OPPONENT ROW */}
          <div className="grid gap-2 grid-cols-4 shrink-0 h-[82px] min-h-[82px]">
            {state.players.filter((p) => p.id !== human.id).map((player) => (
              <BotCompactPanel
                key={player.id}
                player={player}
                active={current.id === player.id}
                onClick={() => setInspectPlayer(player)}
              />
            ))}
            {Array.from({ length: 4 - (state.players.length - 1) }).map((_, i) => (
              <div key={i} className="rounded-xl border border-dashed border-white/4 opacity-15 flex items-center justify-center text-[10px] text-zinc-600 h-full">
                Empty
              </div>
            ))}
          </div>

          {/* LAYER 2: FELT TABLE + INSPECTOR */}
          <div className="flex-1 min-h-0 flex items-stretch gap-3">
            {/* Casino felt board */}
            <section className="relative overflow-hidden rounded-2xl border-[8px] border-zinc-900/90 bg-[radial-gradient(ellipse_at_50%_35%,rgba(22,163,74,0.25),rgba(5,20,12,0.96)_70%,rgba(3,8,5,0.99))] shadow-[inset_0_6px_30px_rgba(0,0,0,0.88),inset_0_-4px_15px_rgba(0,0,0,0.5),0_10px_40px_rgba(0,0,0,0.5)] flex-1 flex items-center justify-center">

              {/* Felt dot-grid texture */}
              <div className="absolute inset-0 opacity-[0.055] [background-image:radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:18px_18px] pointer-events-none" />

              {/* Rim vignette */}
              <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)] pointer-events-none rounded-xl" />

              {/* Bot thinking bubble */}
              <BotThinkingBubble message={activeBotMessage} />

              {/* CENTER DECKS */}
              <div className="flex flex-col items-center justify-center gap-5 z-10 scale-90 sm:scale-100">
                <div className="flex items-center gap-10 justify-center">

                  {/* DRAW PILE */}
                  <div className="text-center flex flex-col items-center">
                    <div className="relative group cursor-default">
                      <div className="absolute inset-0 bg-emerald-400/10 rounded-xl blur-xl group-hover:bg-emerald-400/20 transition-all duration-500 scale-110" />
                      <CardView faceDown size="md" className="border border-emerald-400/18 relative shadow-2xl" />
                      <span className="absolute -bottom-1.5 -right-1.5 grid h-5 w-7 place-items-center rounded-md bg-zinc-950 border border-white/10 text-[10px] font-black font-mono shadow-lg">
                        {state.deck.length}
                      </span>
                    </div>
                    <p className="mt-2.5 text-[9px] uppercase font-black text-zinc-500 tracking-widest">Draw Deck</p>
                  </div>

                  {/* DISCARD PILE */}
                  <div className="text-center flex flex-col items-center">
                    <div className="relative">
                      {state.discard.at(-1) ? (
                        <>
                          <motion.div
                            key={state.discard.at(-1)?.id}
                            initial={{ rotate: -8, scale: 0.88, y: -12, opacity: 0 }}
                            animate={{ rotate: 0, scale: 1, y: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 320, damping: 22 }}
                          >
                            <CardView card={state.discard.at(-1)} size="md" className="shadow-2xl border border-white/8" />
                          </motion.div>
                          <span className="absolute -bottom-1.5 -right-1.5 grid h-5 w-7 place-items-center rounded-md bg-zinc-950 border border-white/10 text-[10px] font-black font-mono shadow-lg">
                            {state.discard.length}
                          </span>
                        </>
                      ) : (
                        <div className="grid h-32 w-23 place-items-center rounded-lg border-2 border-dashed border-white/10 text-[10px] font-black uppercase text-zinc-600 bg-black/15">
                          Empty
                        </div>
                      )}
                    </div>
                    <p className="mt-2.5 text-[9px] uppercase font-black text-zinc-500 tracking-widest">Discard</p>
                  </div>
                </div>

                {/* TURN ACTION CONTROLS */}
                <div className="flex gap-2 bg-black/60 border border-white/10 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl">
                  {drawMove && (
                    <Button
                      size="default"
                      onClick={() => commitMove(drawMove)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black gap-2 shadow-[0_0_18px_rgba(16,185,129,0.4)] cursor-pointer h-9 px-4 text-xs rounded-xl border border-emerald-300/20 hover:scale-[1.02] transition-transform"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Draw Cards
                    </Button>
                  )}

                  {endTurnMove && (
                    <Button
                      variant="secondary"
                      size="default"
                      onClick={() => commitMove(endTurnMove)}
                      className="border border-white/8 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 font-black gap-1.5 cursor-pointer h-9 px-4 text-xs rounded-xl hover:scale-[1.02] transition-transform"
                    >
                      <Check className="h-4 w-4 text-emerald-400" />
                      End Turn
                    </Button>
                  )}

                  {discardMove && (
                    <Button
                      variant="destructive"
                      size="default"
                      onClick={() => commitMove(discardMove)}
                      className="font-black gap-1.5 cursor-pointer h-9 px-4 text-xs rounded-xl hover:scale-[1.02] transition-transform"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Auto Discard
                    </Button>
                  )}

                  {!drawMove && !endTurnMove && !discardMove && (
                    <div className="px-4 py-2 text-[10px] font-black text-zinc-400 tracking-wider uppercase flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
                      {state.pendingInteraction ? "Awaiting Response…" : "Opponents Playing…"}
                    </div>
                  )}
                </div>
              </div>

              {/* PENDING INTERACTION OVERLAY */}
              <AnimatePresence>
                {state.pendingInteraction && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-4"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.85, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.88, y: 15 }}
                      transition={{ type: "spring", stiffness: 350, damping: 26 }}
                      className="bg-zinc-950/97 border border-emerald-500/22 p-6 rounded-2xl max-w-xs w-full text-center flex flex-col items-center shadow-[0_0_60px_rgba(16,185,129,0.2)] relative overflow-hidden"
                    >
                      {/* Top gradient line */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

                      <Badge className="bg-emerald-500/18 text-emerald-300 border border-emerald-500/30 mb-3 uppercase text-[9px] tracking-widest font-black px-2.5 py-1 gap-1">
                        <Zap className="h-2.5 w-2.5 fill-current" />
                        Action Required
                      </Badge>

                      {state.discard.at(-1) && (
                        <div className="my-2">
                          <CardView card={state.discard.at(-1)} size="md" className="shadow-[0_18px_35px_rgba(0,0,0,0.65)] border-amber-400/15" />
                        </div>
                      )}

                      <h3 className="text-sm font-black text-zinc-100 mt-3 leading-snug">
                        {state.pendingInteraction.kind === "payment"
                          ? `Pay $${state.pendingInteraction.debt.amount}M to ${playerName(state, state.pendingInteraction.debt.creditorId)}`
                          : `${playerName(state, state.pendingInteraction.effect.actorId)} targeted you!`}
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-1.5 max-w-[210px] leading-relaxed">
                        {state.pendingInteraction.kind === "payment"
                          ? "Select vault cash or properties below to pay. No change is returned."
                          : "Play a Just Say No card to block, or allow the action."}
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* CARD INSPECTOR PANEL */}
            <AnimatePresence>
              {selectedCard && (
                isMobile ? (
                  <motion.div
                    key="mobile-inspector"
                    initial={{ opacity: 0, y: 20, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    className="fixed bottom-[265px] left-3 right-3 z-30 flex flex-row items-center gap-3 rounded-2xl border border-emerald-500/22 bg-zinc-950/97 p-3 shadow-2xl backdrop-blur-xl justify-between overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                    <div className="flex-1 flex gap-3 min-w-0 z-10 items-center">
                      <div className="shrink-0">
                        <CardView card={selectedCard} size="sm" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                        <div className="relative">
                          <div className="flex justify-between items-center pr-6">
                            <h3 className="font-black text-xs text-zinc-100 truncate">{selectedCard.name}</h3>
                          </div>
                          <p className="text-[9px] text-zinc-400 mt-0.5 leading-snug line-clamp-2">
                            {selectedCard.kind === "money" ? "Vault currency. Bank it to protect from rent."
                            : selectedCard.kind === "property" ? "Place on board. Form completed color groups to win."
                            : "Launches rent requests, blocks attacks, or sweeps property sets."}
                          </p>
                          <button onClick={() => setSelectedCardId(undefined)} className="absolute right-0 top-0 p-1 hover:bg-white/6 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-none py-0.5">
                          {selectedMoves.map((move, i) => (
                            <Button key={`${move.type}-${i}`} size="sm" className="text-[10px] h-7 px-2.5 font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0 rounded-lg" onClick={() => commitMove(move)}>
                              {moveLabel(state, move)}
                            </Button>
                          ))}
                          {selectedMoves.length === 0 && (
                            <p className="text-[9px] text-zinc-500 italic bg-black/25 px-2.5 py-1 rounded shrink-0">No actions available now.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.aside
                    key="desktop-inspector"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 300, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    className="shrink-0 flex flex-col rounded-2xl border border-white/6 bg-zinc-950/75 p-4 shadow-xl justify-between overflow-hidden relative"
                  >
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.03),transparent_45%)]" />
                    <div className="flex-1 flex flex-col justify-between h-full min-w-0 z-10">
                      <div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2.5 mb-3">
                          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                            <Hand className="h-3.5 w-3.5 text-emerald-400" />
                            Card Details
                          </span>
                          <button onClick={() => setSelectedCardId(undefined)} className="p-1 hover:bg-white/6 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="mb-4 flex justify-center">
                          <CardView card={selectedCard} size="md" />
                        </div>

                        <h3 className="font-black text-sm text-zinc-100 truncate">{selectedCard.name}</h3>
                        <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                          {selectedCard.kind === "money" ? "Vault currency. Bank it to protect from rent."
                          : selectedCard.kind === "property" ? "Place on board. Form completed color groups to win."
                          : "Launches rent requests, blocks attacks, or sweeps property sets."}
                        </p>
                      </div>

                      <div className="grid gap-1.5 mt-4 pt-3 border-t border-white/5 overflow-y-auto max-h-[180px]">
                        {selectedMoves.map((move, i) => (
                          <Button key={`${move.type}-${i}`} size="sm" className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-9 shrink-0 rounded-xl gap-1.5 hover:scale-[1.01] transition-transform" onClick={() => commitMove(move)}>
                            <ChevronRight className="h-3.5 w-3.5" />
                            {moveLabel(state, move)}
                          </Button>
                        ))}
                        {selectedMoves.length === 0 && (
                          <p className="text-[9px] text-zinc-500 italic bg-black/25 p-2.5 rounded-lg text-center">No actions available in this phase.</p>
                        )}
                      </div>
                    </div>
                  </motion.aside>
                )
              )}
            </AnimatePresence>
          </div>

          {/* LAYER 3: PLAYER PANEL & HAND */}
          <section className={cn(
            "rounded-2xl border bg-black/22 p-2.5 shadow-2xl shrink-0 h-[255px] min-h-[255px] flex flex-col justify-between overflow-hidden transition-all duration-300",
            isMyTurn ? "border-emerald-400/30 animate-turn-glow" : "border-white/5"
          )}>
            {/* Player Stats & Tableau */}
            <div className="flex items-center gap-3 min-h-[110px] h-[110px] min-w-0">
              {/* Stats card */}
              <div className="w-[10.5rem] rounded-xl border border-white/5 bg-zinc-950/45 p-2 flex flex-col justify-between shrink-0 h-full">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "grid h-8 w-8 place-items-center rounded-full border font-mono text-sm font-black transition-colors",
                    isMatchPt
                      ? "border-amber-400/60 bg-amber-950/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                      : "border-emerald-500/22 bg-emerald-950/15 text-emerald-300"
                  )}>
                    {human.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-black text-zinc-100 truncate">You</p>
                      {isMatchPt && <span className="text-[9px] font-black text-amber-400 animate-pulse">★★</span>}
                    </div>
                    <p className="text-[9.5px] font-bold text-zinc-400 leading-none mt-0.5">Net: ${playerNetWorth(human)}M</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-1.5 mt-1">
                  <div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider block">Vault</span>
                    <span className="font-mono text-xs font-black text-amber-300">${bankTotal(human)}M</span>
                  </div>
                  <div className="flex -space-x-3.5 overflow-visible max-w-[65px]">
                    {human.bank.slice(0, 4).map((card, idx) => (
                      <div key={card.id} style={{ zIndex: idx, transform: `rotate(${(idx - 1.5) * 4}deg)` }}>
                        <CardView card={card} size="xs" className="border-white/5 shadow" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Properties row */}
              <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-thin items-stretch h-full pb-1">
                {humanGroups.map((group) => (
                  <SetColumn key={group.color} group={group} small />
                ))}
                {humanGroups.length === 0 && (
                  <div className="flex-1 rounded-xl border border-dashed border-white/5 bg-black/10 flex items-center justify-center text-xs text-zinc-500 italic">
                    No properties played yet
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-white/5 my-1.5 shrink-0" />

            {/* Hand */}
            <div className="overflow-x-auto scrollbar-none h-[135px] min-h-[135px] shrink-0 flex items-end justify-center pb-1">
              <div className="flex items-end justify-center -space-x-5 hover:-space-x-1 px-6 transition-all duration-300">
                <AnimatePresence initial={false}>
                  {human.hand.map((card, index) => {
                    const offset = index - (human.hand.length - 1) / 2;
                    const rot    = offset * 1.5;
                    return (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 50, rotate: 8, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, rotate: rot, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.85 }}
                        transition={{ type: "spring", stiffness: 300, damping: 24 }}
                        className="shrink-0 flex items-end justify-center"
                      >
                        <CardView
                          card={card}
                          size="md"
                          selected={selectedCardId === card.id}
                          disabled={current.id !== human.id && state.pendingInteraction?.kind !== "just_say_no"}
                          onClick={() => setSelectedCardId(card.id)}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {human.hand.length === 0 && (
                  <div className="grid h-16 w-full place-items-center text-[10px] font-semibold text-zinc-500 bg-black/10 px-6 rounded-lg italic">
                    Empty hand — draw cards to play
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>

      {/* ══ PAYMENT MODAL ══ */}
      <Dialog open={Boolean(pendingPayment)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/8 bg-zinc-950 text-zinc-50 sm:max-w-xl shadow-2xl backdrop-blur-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-rose-400/50 to-transparent" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl font-black">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/12 border border-emerald-500/25">
                <CreditCard className="h-4.5 w-4.5 text-emerald-400" />
              </div>
              Payment Requested
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs leading-relaxed">
              You owe <strong className="text-zinc-200">${pendingPayment?.debt.amount ?? 0}M</strong> to{" "}
              <strong className="text-zinc-200">{pendingPayment ? playerName(state, pendingPayment.debt.creditorId) : ""}</strong>. No change is returned — overpayment is kept.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2 max-h-52 overflow-y-auto pr-1 mt-1">
            {assets.map((asset) => (
              <button
                key={asset.card.id}
                type="button"
                onClick={() => togglePayment(asset.card.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer select-none relative",
                  selectedPaymentIds.includes(asset.card.id)
                    ? "border-emerald-400/60 bg-emerald-500/12 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
                    : "border-white/6 bg-black/22 hover:border-white/12 hover:bg-white/3"
                )}
              >
                {selectedPaymentIds.includes(asset.card.id) && (
                  <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-emerald-400 grid place-items-center text-zinc-950 text-[9px] font-black shadow">✓</span>
                )}
                <p className="text-xs font-bold text-zinc-200 line-clamp-1">{asset.label}</p>
                <p className="font-mono text-[10px] text-zinc-400 mt-0.5">${asset.card.value}M · {asset.source}</p>
              </button>
            ))}
            {assets.length === 0 && (
              <p className="text-xs text-zinc-500 py-6 text-center border border-dashed border-white/5 rounded-xl col-span-2">
                You have zero payable assets — payment will be skipped.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/40 p-3.5 mt-2">
            <div>
              <p className="text-xs font-bold text-zinc-200 font-mono">Paying: <span className="text-emerald-400">${selectedPayTotal}M</span> / <span className="text-zinc-400">${pendingPayment?.debt.amount ?? 0}M</span></p>
              <p className="text-[9px] text-zinc-500 mt-0.5">Select from your vault and tableau.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="cursor-pointer text-xs font-semibold rounded-lg"
                onClick={() => pendingPayment && setSelectedPaymentIds(chooseAutoPayment(human, pendingPayment.debt.amount))}>
                Auto-Select
              </Button>
              <Button size="sm" className="cursor-pointer text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg gap-1.5"
                disabled={!canPay || !pendingPayMove} onClick={() => pendingPayMove && commitMove(pendingPayMove)}>
                <Check className="h-3.5 w-3.5" />
                Commit Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ JUST SAY NO MODAL ══ */}
      <Dialog open={Boolean(pendingJsn)} onOpenChange={() => undefined}>
        <DialogContent className="border-white/8 bg-zinc-950 text-zinc-50 sm:max-w-md shadow-2xl backdrop-blur-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-black">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 border border-violet-500/25">
                <Shield className="h-4.5 w-4.5 text-violet-400" />
              </div>
              Counter Incoming Action?
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs leading-relaxed">
              <strong className="text-zinc-200">{pendingJsn ? playerName(state, pendingJsn.effect.actorId) : "An opponent"}</strong> targeted you. Play a Just Say No to block, or allow the action to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {legalMoves.filter((m) => m.type === "respond_jsn").map((move, i) => (
              <Button
                key={i}
                variant={move.type === "respond_jsn" && move.useCardId ? "default" : "secondary"}
                className={cn("cursor-pointer font-bold justify-start gap-2 rounded-xl h-11", move.type === "respond_jsn" && move.useCardId && "bg-violet-600 hover:bg-violet-500 border-violet-400/25")}
                onClick={() => commitMove(move)}
              >
                {move.type === "respond_jsn" && move.useCardId
                  ? <Shield className="h-4 w-4 text-violet-200" />
                  : <Check className="h-4 w-4" />}
                {moveLabel(state, move)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ WIN DIALOG ══ */}
      <Dialog open={Boolean(winner)} onOpenChange={() => undefined}>
        <DialogContent className="text-zinc-50 sm:max-w-md shadow-2xl backdrop-blur-2xl text-center animate-win-rainbow bg-zinc-950 border-2 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400/50 via-emerald-400/50 to-violet-400/50" />
          <DialogHeader className="items-center">
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.1 }}
              className="h-16 w-16 rounded-2xl bg-amber-500/12 border border-amber-500/30 grid place-items-center mb-3"
            >
              <Sparkles className="h-8 w-8 text-amber-300 animate-pulse" />
            </motion.div>
            <DialogTitle className="text-3xl font-black text-zinc-100">
              {winner?.name} Wins!
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs mt-1">
              Completed 3 full property sets first — legendary!
            </DialogDescription>
          </DialogHeader>

          {winner && (
            <div className="my-4 flex flex-col gap-3 items-center">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Winning Property Sets</p>
              <div className="flex gap-2.5 overflow-x-auto justify-center py-2">
                {completeSetColors(winner).slice(0, 3).map((color) => (
                  <div key={color} className="rounded-xl border border-white/6 bg-zinc-900/50 p-3 min-w-24 text-center">
                    <span className="mb-2 block h-1.5 w-full rounded-full" style={{ backgroundColor: propertyColorStyle(color) }} />
                    <p className="text-xs font-black text-zinc-200">{colorName(color)}</p>
                    <p className="font-mono text-[10px] text-zinc-400 mt-1">Rent ${rentForColor(winner, color)}M</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 mt-4 justify-center w-full">
            <Button onClick={() => startNewGame()} className="cursor-pointer font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex-1 h-11 rounded-xl gap-2">
              <RefreshCw className="h-4 w-4" />
              Rematch
            </Button>
            <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "flex-1 h-11 font-bold cursor-pointer border border-white/6 rounded-xl gap-2")}>
              <DoorOpen className="h-4 w-4" />
              Menu
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ ACTION LOG SHEET ══ */}
      <Sheet open={isLogOpen} onOpenChange={setIsLogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-zinc-950/97 border-white/6 text-zinc-50 flex flex-col h-full shadow-2xl backdrop-blur-2xl">
          <SheetHeader className="border-b border-white/5 pb-3.5 flex flex-row items-center gap-2">
            <History className="h-4 w-4 text-emerald-400" />
            <SheetTitle className="text-base font-black uppercase tracking-wider text-zinc-100">
              Live Action Log
            </SheetTitle>
            <button onClick={() => setIsLogOpen(false)} className="ml-auto p-1.5 hover:bg-white/5 rounded-lg cursor-pointer text-zinc-400 hover:text-zinc-200">
              <ChevronDown className="h-4 w-4" />
            </button>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4 pr-1.5">
            <div className="space-y-2">
              {[...state.log].reverse().map((event) => (
                <div key={event.id} className="rounded-xl border border-white/5 bg-zinc-900/30 px-3.5 py-2.5 text-[11px] text-zinc-300 leading-relaxed font-medium">
                  {event.message}
                </div>
              ))}
              {state.log.length === 0 && (
                <p className="py-12 text-center text-xs text-zinc-600">No turns logged yet — deal to start!</p>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ══ BOT TABLEAU DIALOG ══ */}
      <BotTableauDialog player={inspectPlayer ?? undefined} open={Boolean(inspectPlayer)} onClose={() => setInspectPlayer(null)} />

      {/* Sync indicator */}
      <div className="fixed bottom-3 right-3 hidden rounded-full border border-white/5 bg-zinc-950/80 px-3 py-1.5 text-[10px] text-zinc-600 backdrop-blur-xl sm:flex items-center gap-1.5 font-mono">
        <span className={cn("h-1.5 w-1.5 rounded-full", hydrated ? "bg-emerald-500" : "bg-zinc-600 animate-pulse")} />
        {hydrated ? "synced" : "loading"}
      </div>
    </main>
  );
}
