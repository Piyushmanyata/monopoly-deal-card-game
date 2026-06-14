"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, BookOpen, ChevronRight, Sparkles, Star, Trophy, Layers3, Play, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { playSfx } from "@/lib/sound/sfx";
import { cn } from "@/lib/utils";

const AVATARS = ["😎", "🦊", "🦁", "🐼", "🦖", "🤖", "🧙‍♂️", "👩‍🚀", "🐱", "🐶"];

const CARD_DICTIONARY = [
  { name: "Deal Breaker", kind: "Action", val: "5M", desc: "Steal an opponent's complete property set, including any active houses or hotels.", color: "#e34040" },
  { name: "Sly Deal", kind: "Action", val: "3M", desc: "Steal a single property from an opponent. (Cannot steal from a complete set).", color: "#f08a25" },
  { name: "Forced Deal", kind: "Action", val: "3M", desc: "Swap one of your properties with an opponent's property. (Cannot swap from a complete set).", color: "#2754b8" },
  { name: "Just Say No", kind: "Action", val: "4M", desc: "Block any action card played against you. Can be chained back and forth.", color: "#d84f9a" },
  { name: "Debt Collector", kind: "Action", val: "3M", desc: "Demand $5M payment from any single player.", color: "#815038" },
  { name: "It's My Birthday", kind: "Action", val: "2M", desc: "Collect $2M payment from every opponent.", color: "#f1c84b" },
  { name: "Pass Go", kind: "Action", val: "1M", desc: "Draw 2 cards from the draw pile.", color: "#2fa36b" },
  { name: "Double Rent", kind: "Action", val: "1M", desc: "Play with a Rent card to double the rent amount due.", color: "#9aa4b2" },
  { name: "House", kind: "Building", val: "3M", desc: "Add to any complete property set. Increases rent value by $3M.", color: "#2c3035" },
  { name: "Hotel", kind: "Building", val: "4M", desc: "Add to a property set that already has a House. Increases rent value by $4M.", color: "#7ed7f3" },
];

/* Floating card silhouettes rendered in the background */
const FLOAT_SPECS = [
  { color: "#e34040", rotate: -22, x: "4%",  y: "12%",  opacity: 0.13, anim: "animate-float-a", delay: "0s"    },
  { color: "#2fa36b", rotate:  18, x: "88%", y: "7%",   opacity: 0.11, anim: "animate-float-b", delay: "1.2s"  },
  { color: "#2754b8", rotate:  -8, x: "93%", y: "60%",  opacity: 0.09, anim: "animate-float-c", delay: "0.6s"  },
  { color: "#f1c84b", rotate:  25, x: "2%",  y: "68%",  opacity: 0.10, anim: "animate-float-d", delay: "1.8s"  },
  { color: "#d84f9a", rotate:  -4, x: "47%", y: "92%",  opacity: 0.07, anim: "animate-float-a", delay: "0.9s"  },
  { color: "#f08a25", rotate:  12, x: "72%", y: "80%",  opacity: 0.08, anim: "animate-float-b", delay: "2.1s"  },
  { color: "#815038", rotate: -18, x: "20%", y: "5%",   opacity: 0.08, anim: "animate-float-c", delay: "0.3s"  },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("Player");
  const [selectedAvatar, setSelectedAvatar] = useState("😎");
  const [botCount, setBotCount] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");

  const sfx = (n: "draw" | "place" | "money" | "steal" | "no" | "turn" | "win") => {
    if (typeof window !== "undefined") {
      playSfx(n, window.localStorage.getItem("deal.muted") === "true");
    }
  };

  const handleStartGame = () => {
    sfx("turn");
    const query = new URLSearchParams({
      name: name.trim() || "Player",
      avatar: selectedAvatar,
      bots: botCount.toString(),
      difficulty,
    });
    router.push(`/play?${query.toString()}`);
  };

  const DIFF_META = {
    easy:   { label: "Easy",   emoji: "😌", color: "text-emerald-400" },
    normal: { label: "Normal", emoji: "🎯", color: "text-amber-400"   },
    hard:   { label: "Hard",   emoji: "🔥", color: "text-rose-400"    },
  } as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.22)_0%,transparent_55%),radial-gradient(ellipse_at_10%_40%,rgba(39,84,184,0.08),transparent_30%),radial-gradient(ellipse_at_90%_80%,rgba(216,79,154,0.06),transparent_25%),linear-gradient(160deg,#030b06,#091310_50%,#0d080f)] text-zinc-50 flex flex-col items-center overflow-x-hidden">

      {/* ─── Floating card silhouettes (background decorations) ─── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        {FLOAT_SPECS.map((spec, i) => (
          <div
            key={i}
            className={cn("absolute rounded-xl border border-white/10", spec.anim)}
            style={{
              left: spec.x,
              top: spec.y,
              transform: `rotate(${spec.rotate}deg)`,
              opacity: spec.opacity,
              animationDelay: spec.delay,
              width: 72,
              height: 100,
              background: `linear-gradient(160deg, ${spec.color}22, ${spec.color}08)`,
              borderColor: `${spec.color}30`,
              boxShadow: `0 4px 20px ${spec.color}18`,
            }}
          >
            <div className="absolute inset-0.5 rounded-[9px]" style={{ background: `${spec.color}12` }} />
            <div className="h-4 w-full rounded-t-[10px]" style={{ background: spec.color, opacity: 0.4 }} />
          </div>
        ))}

        {/* Ambient sparkle dots */}
        {[
          { x: "15%", y: "30%", d: "sparkle"    },
          { x: "80%", y: "25%", d: "sparkle-d1"  },
          { x: "60%", y: "75%", d: "sparkle-d2"  },
          { x: "35%", y: "55%", d: "sparkle-d3"  },
          { x: "90%", y: "45%", d: "sparkle-d4"  },
        ].map((s, i) => (
          <div
            key={`sp-${i}`}
            className={cn("absolute h-1.5 w-1.5 rounded-full bg-emerald-400/50", s.d)}
            style={{ left: s.x, top: s.y }}
          />
        ))}
      </div>

      <section className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:py-14 flex-1 flex flex-col gap-8 justify-center">

        {/* ─── Hero Header ─── */}
        <div className="text-center space-y-4">
          <div className="animate-fade-up">
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-pulse inline-flex items-center gap-1.5">
              <Zap className="h-3 w-3 fill-current" />
              Premium Card Game Experience
            </Badge>
          </div>

          <div className="animate-hero-slam">
            <h1 className="text-7xl sm:text-9xl font-black tracking-tighter select-none leading-none">
              <span
                className="animate-gradient-text bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, #6ee7b7 0%, #34d399 20%, #10b981 40%, #059669 60%, #34d399 80%, #6ee7b7 100%)",
                  backgroundSize: "200% auto",
                  filter: "drop-shadow(0 0 30px rgba(52,211,153,0.4))",
                }}
              >
                DEAL!
              </span>
            </h1>
          </div>

          <p className="animate-fade-up-d2 max-w-lg mx-auto text-zinc-300 text-sm sm:text-base leading-relaxed font-medium">
            Build property sets · Charge rent · Deploy action cards · Outsmart tactical bots
          </p>

          <div className="animate-fade-up-d3 flex items-center justify-center gap-4 text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-400 fill-current" /> 3 Complete Sets to Win</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-1"><Bot className="h-3 w-3 text-emerald-400" /> Up to 4 Bot Opponents</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-violet-400" /> Auto-Saves Progress</span>
          </div>
        </div>

        {/* ─── Main Grid: Setup + Card Showcase ─── */}
        <div className="animate-fade-up-d4 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] items-stretch">

          {/* Setup Form */}
          <Card className="border-white/8 bg-zinc-950/50 backdrop-blur-xl shadow-2xl shadow-black/40 flex flex-col justify-between overflow-hidden relative">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="flex items-center gap-2 text-xl font-black text-zinc-100">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 border border-emerald-500/25">
                  <Bot className="h-4.5 w-4.5 text-emerald-400" />
                </div>
                Configure Your Table
              </CardTitle>
              <CardDescription className="text-zinc-400 text-xs">
                Choose your profile, difficulty, and number of opponents
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pt-5 flex-1">
              {/* Player Name */}
              <div className="space-y-2">
                <Label htmlFor="player-name" className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Player Name
                </Label>
                <Input
                  id="player-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 15))}
                  placeholder="Enter your name…"
                  className="bg-black/40 border-white/8 text-zinc-100 focus:border-emerald-500/60 h-11 text-sm font-semibold placeholder:text-zinc-600 transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
                />
              </div>

              {/* Difficulty */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Difficulty
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["easy", "normal", "hard"] as const).map((diff) => {
                    const meta = DIFF_META[diff];
                    const active = difficulty === diff;
                    return (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => { setDifficulty(diff); sfx("place"); }}
                        className={cn(
                          "flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl text-xs font-bold capitalize border transition-all duration-200 cursor-pointer",
                          active
                            ? "bg-emerald-600/90 border-emerald-400/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]"
                            : "bg-black/30 border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-200 hover:bg-white/4"
                        )}
                      >
                        <span className="text-base leading-none">{meta.emoji}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Avatar Picker */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Pick an Avatar
                </Label>
                <div className="grid grid-cols-5 gap-2 bg-black/25 p-2.5 rounded-xl border border-white/5">
                  {AVATARS.map((emoji) => {
                    const active = selectedAvatar === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => { setSelectedAvatar(emoji); sfx("place"); }}
                        className={cn(
                          "text-2xl p-2 rounded-xl transition-all duration-200 cursor-pointer select-none",
                          active
                            ? "bg-emerald-500/18 border border-emerald-400/60 scale-110 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
                            : "border border-transparent hover:bg-white/6 hover:scale-105"
                        )}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bot Count */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Bot Opponents
                  </Label>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 font-mono text-[10px] h-5 px-2">
                    {botCount} {botCount === 1 ? "Bot" : "Bots"}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => { setBotCount(count); sfx("place"); }}
                      className={cn(
                        "py-2.5 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer flex flex-col items-center gap-0.5",
                        botCount === count
                          ? "bg-emerald-600/90 border-emerald-400/50 text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                          : "bg-black/30 border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-200"
                      )}
                    >
                      <span className="text-base leading-none">{"🤖".repeat(Math.min(count, 2))}</span>
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>

            <div className="p-5 pt-0">
              <Button
                onClick={handleStartGame}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-13 shadow-none text-base gap-2.5 group transition-all duration-200 cursor-pointer animate-btn-glow rounded-xl border border-emerald-400/30 hover:border-emerald-300/50 hover:scale-[1.01]"
              >
                <Play className="h-5 w-5 fill-current group-hover:scale-110 transition-transform" />
                DEAL THE CARDS
                <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </div>
          </Card>

          {/* Card Showcase & Win Condition */}
          <div className="flex flex-col justify-center items-center relative py-8 overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/20 backdrop-blur">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.06),transparent_65%)]" />
            <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:18px_18px]" />

            {/* Animated fanned card stack */}
            <div className="relative flex -space-x-11 select-none pointer-events-none z-10">
              {[
                { color: "#e34040", rotate: -16, label: "Red Set",    delay: "0s"    },
                { color: "#2fa36b", rotate: -5,  label: "Green Set",  delay: "0.08s" },
                { color: "#2754b8", rotate:  6,  label: "Blue Set",   delay: "0.16s" },
                { color: "#f1c84b", rotate:  17, label: "Yellow Set", delay: "0.24s" },
              ].map((spec, idx) => (
                <div
                  key={idx}
                  className="animate-fade-up card-sheen"
                  style={{
                    animationDelay: spec.delay,
                    zIndex: idx,
                    transform: `rotate(${spec.rotate}deg)`,
                  }}
                >
                  {/* Shadow layer underneath */}
                  <div
                    className="h-52 w-36 rounded-xl"
                    style={{
                      background: `linear-gradient(160deg, #faf7f0, #f0e8d4)`,
                      boxShadow: `0 20px 40px -8px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)`,
                      border: "1px solid rgba(255,255,255,0.15)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div className="absolute inset-0.5 rounded-[10px] border border-zinc-950/6" />
                    <div className="h-9 w-full rounded-t-[10px] border-b border-zinc-950/12" style={{ backgroundColor: spec.color }} />
                    <div className="p-3 space-y-1.5 mt-1">
                      <div className="h-2.5 w-1/3 rounded bg-zinc-900/50" />
                      <div className="h-2.5 w-2/3 rounded bg-zinc-900/25" />
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                      <div className="font-mono text-lg font-black text-zinc-900">$2M</div>
                      <div
                        className="text-[8px] font-black uppercase rounded px-1.5 py-0.5 text-white"
                        style={{ backgroundColor: spec.color }}
                      >
                        {spec.label}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Win condition info */}
            <div className="mt-8 text-center px-6 max-w-xs relative z-10">
              <div className="flex items-center justify-center gap-1.5 text-zinc-200 text-xs font-black uppercase tracking-wider mb-3">
                <Trophy className="h-4 w-4 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                How to Win
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The first player to build <strong className="text-zinc-200">3 complete color sets</strong> wins. Charge rent to drain opponents and use action cards to steal or block!
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { emoji: "🏠", label: "Build Sets",  sub: "3 colors" },
                  { emoji: "💸", label: "Charge Rent", sub: "Drain banks" },
                  { emoji: "🃏", label: "Play Actions", sub: "Steal & block" },
                ].map((step) => (
                  <div key={step.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-black/20 p-2.5">
                    <span className="text-xl">{step.emoji}</span>
                    <span className="text-[9px] font-black text-zinc-300 uppercase tracking-wide">{step.label}</span>
                    <span className="text-[8px] text-zinc-500 font-medium">{step.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Rules & Dictionary ─── */}
        <div className="animate-fade-up-d5">
          <Tabs defaultValue="rules" className="w-full">
            <TabsList className="grid w-full max-w-sm mx-auto grid-cols-2 bg-zinc-950/60 border border-white/8 p-1 rounded-xl h-10">
              <TabsTrigger value="rules" className="gap-1.5 font-bold text-xs rounded-lg">
                <BookOpen className="h-3.5 w-3.5" />
                Game Rules
              </TabsTrigger>
              <TabsTrigger value="dictionary" className="gap-1.5 font-bold text-xs rounded-lg">
                <Layers3 className="h-3.5 w-3.5" />
                Card Dictionary
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rules" className="mt-5">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    step: "1", title: "Turn Start", color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20",
                    lines: [
                      "Draw 2 cards at the start of your turn.",
                      "If your hand is completely empty, draw 5 cards instead."
                    ]
                  },
                  {
                    step: "2", title: "Play Up to 3 Cards", color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20",
                    lines: [
                      "Play properties to your tableau to build sets.",
                      "Bank money cards to protect your cash stash.",
                      "Fire action cards to rent, steal, or counter opponents."
                    ]
                  },
                  {
                    step: "3", title: "End Turn & Discard", color: "text-violet-300", bg: "bg-violet-500/10 border-violet-500/20",
                    lines: [
                      "Click End Turn when you're done playing.",
                      "If you hold more than 7 cards, discard the excess."
                    ]
                  },
                ].map((rule) => (
                  <Card key={rule.step} className="border-white/5 bg-zinc-950/25 backdrop-blur hover:bg-zinc-950/35 transition-colors">
                    <CardHeader className="pb-2">
                      <div className={cn("flex items-center gap-2 font-bold text-sm", rule.color)}>
                        <span className={cn("grid h-6 w-6 place-items-center rounded-full border text-[11px] font-black", rule.bg)}>
                          {rule.step}
                        </span>
                        {rule.title}
                      </div>
                    </CardHeader>
                    <CardContent className="text-xs text-zinc-300 leading-relaxed space-y-2">
                      {rule.lines.map((line, i) => (
                        <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="dictionary" className="mt-5">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {CARD_DICTIONARY.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/5 bg-black/25 p-3 flex flex-col justify-between hover:bg-black/35 hover:border-white/10 transition-all duration-200 group"
                  >
                    <div>
                      <div className="h-1 w-full rounded-full mb-2.5" style={{ backgroundColor: item.color }} />
                      <div className="flex justify-between items-start gap-1.5 mb-1.5">
                        <p className="font-black text-xs text-zinc-100 leading-snug">{item.name}</p>
                        <Badge variant="secondary" className="text-[9px] shrink-0 bg-zinc-800/80 border-white/5 font-bold px-1.5 py-0.5 h-auto">
                          {item.kind}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                        ${item.val}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: item.color }}>
                        {item.kind}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <footer className="relative w-full border-t border-white/5 bg-black/35 py-4 text-center text-[11px] text-zinc-600 backdrop-blur">
        Monopoly Deal · Single Player vs Bots · Built with Next.js & Framer Motion
      </footer>
    </main>
  );
}
