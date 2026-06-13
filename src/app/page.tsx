"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, BookOpen, Sparkles, User, Trophy, Layers3, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AVATARS = ["😎", "🦊", "🦁", "🐼", "🦖", "🤖", "🧙‍♂️", "👩‍🚀", "🐱", "🐶"];

const CARD_DICTIONARY = [
  { name: "Deal Breaker", kind: "Action", val: "5M", desc: "Steal an opponent's complete property set, including any active houses or hotels." },
  { name: "Sly Deal", kind: "Action", val: "3M", desc: "Steal a single property from an opponent. (Cannot steal from a complete set)." },
  { name: "Forced Deal", kind: "Action", val: "3M", desc: "Swap one of your properties with an opponent's property. (Cannot swap from a complete set)." },
  { name: "Just Say No", kind: "Action", val: "4M", desc: "Block any action card played against you. Can be chained back and forth." },
  { name: "Debt Collector", kind: "Action", val: "3M", desc: "Demand $5M payment from any single player." },
  { name: "It's My Birthday", kind: "Action", val: "2M", desc: "Collect $2M payment from every opponent." },
  { name: "Pass Go", kind: "Action", val: "1M", desc: "Draw 2 cards from the draw pile." },
  { name: "Double Rent", kind: "Action", val: "1M", desc: "Play with a Rent card to double the rent amount due." },
  { name: "House", kind: "Building", val: "3M", desc: "Add to any complete property set. Increases rent value by $3M." },
  { name: "Hotel", kind: "Building", val: "4M", desc: "Add to a property set that already has a House. Increases rent value by $4M." },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("Player");
  const [selectedAvatar, setSelectedAvatar] = useState("😎");
  const [botCount, setBotCount] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");

  const handleStartGame = () => {
    const query = new URLSearchParams({
      name: name.trim() || "Player",
      avatar: selectedAvatar,
      bots: botCount.toString(),
      difficulty,
    });
    router.push(`/play?${query.toString()}`);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_12%_30%,rgba(52,211,153,0.08),transparent_25%),linear-gradient(135deg,#040b08,#0a1410_55%,#11090f)] text-zinc-50 flex flex-col items-center">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12 flex-1 flex flex-col gap-8 justify-center">
        {/* Hero Header */}
        <div className="text-center space-y-3">
          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
            <Sparkles className="h-3 w-3 mr-1.5 inline" />
            Premium Single Player Experience
          </Badge>
          <h1 className="text-6xl sm:text-8xl font-black tracking-tighter bg-gradient-to-b from-emerald-100 via-emerald-400 to-emerald-800 bg-clip-text text-transparent drop-shadow-xl select-none">
            DEAL!
          </h1>
          <p className="max-w-xl mx-auto text-zinc-300 text-sm sm:text-base leading-relaxed font-medium">
            Build property sets, charge massive rent, deploy game-changing actions, and outsmart tactical bots in a beautiful browser table.
          </p>
        </div>

        {/* Setup and Cards */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
          {/* Custom Setup Form */}
          <Card className="border-white/10 bg-zinc-950/40 backdrop-blur-xl shadow-2xl flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-zinc-100">
                <Bot className="h-5 w-5 text-emerald-400" />
                Configure Table
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Set up your single player game rules and profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-5 flex-1">
              {/* Profile Details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="player-name" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Player Name
                  </Label>
                  <div className="relative">
                    <Input
                      id="player-name"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 15))}
                      placeholder="Enter name..."
                      className="bg-black/40 border-white/10 text-zinc-100 focus:border-emerald-500/50 pl-9 h-11"
                    />
                    <User className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Difficulty
                  </Label>
                  <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-md border border-white/10 h-11">
                    {(["easy", "normal", "hard"] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setDifficulty(diff)}
                        className={`text-xs font-bold capitalize rounded-md transition ${
                          difficulty === diff
                            ? "bg-emerald-600 text-white shadow"
                            : "text-zinc-400 hover:text-zinc-100"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Avatar Picker */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Select Avatar Emoji
                </Label>
                <div className="flex flex-wrap gap-2 bg-black/30 p-2.5 rounded-lg border border-white/5 justify-between">
                  {AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedAvatar(emoji)}
                      className={`text-2xl p-1.5 rounded-md transition-all duration-150 hover:scale-110 ${
                        selectedAvatar === emoji
                          ? "bg-emerald-500/20 border border-emerald-400 scale-105 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                          : "border border-transparent hover:bg-white/5"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Count */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Number of Opponents (Bots)
                  </Label>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 font-mono">
                    {botCount} Bot{botCount > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 bg-black/40 p-1 rounded-md border border-white/10">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setBotCount(count)}
                      className={`py-2 text-xs font-bold rounded capitalize transition ${
                        botCount === count
                          ? "bg-emerald-600 text-zinc-50 shadow"
                          : "text-zinc-400 hover:text-zinc-100"
                      }`}
                    >
                      {count} Opponent{count > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>

            <div className="p-5 pt-0 border-t border-white/5 mt-5">
              <Button
                onClick={handleStartGame}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_25px_rgba(16,185,129,0.4)] text-base gap-2 group transition-all duration-200 cursor-pointer animate-none"
              >
                <Play className="h-5 w-5 fill-current" />
                DEAL CARDS
              </Button>
            </div>
          </Card>

          {/* Cards Stack Presentation */}
          <div className="flex flex-col justify-center items-center relative py-8 overflow-hidden rounded-xl border border-white/5 bg-zinc-950/15">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.04),transparent_60%)]" />
            <div className="relative flex -space-x-12 select-none pointer-events-none filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.65)] hover:scale-102 transition duration-300">
              {[
                { color: "#e34040", rotate: -15, label: "Red Set" },
                { color: "#2fa36b", rotate: -5, label: "Green Set" },
                { color: "#2754b8", rotate: 5, label: "Blue Set" },
                { color: "#f1c84b", rotate: 15, label: "Yellow Set" },
              ].map((cardSpec, idx) => (
                <div
                  key={idx}
                  className="h-56 w-40 rounded-xl border border-white/20 bg-[#faf7f0] p-4 flex flex-col justify-between shadow-2xl relative"
                  style={{
                    transform: `rotate(${cardSpec.rotate}deg)`,
                    zIndex: idx,
                  }}
                >
                  <div className="absolute inset-0.5 rounded-[10px] border border-zinc-950/5" />
                  <div className="h-8 w-full rounded-md border-b border-zinc-950/5" style={{ backgroundColor: cardSpec.color }} />
                  <div>
                    <div className="h-3 w-1/3 rounded bg-zinc-900/60" />
                    <div className="mt-1 h-3 w-2/3 rounded bg-zinc-900/30" />
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="font-mono text-xl font-black text-zinc-900">$2M</div>
                    <div className="text-[9px] font-black uppercase text-zinc-400">Deal</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center px-4 max-w-sm">
              <div className="flex items-center justify-center gap-1.5 text-zinc-300 text-xs font-bold uppercase tracking-wider mb-2">
                <Trophy className="h-4 w-4 text-amber-300" />
                Win Condition
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                The first player to build <strong>3 complete sets</strong> of different colors wins. Charge rent to drain players of bank assets and force payments!
              </p>
            </div>
          </div>
        </div>

        {/* Rules and Library Tabs */}
        <div className="mt-4">
          <Tabs defaultValue="rules" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-zinc-950/50 border border-white/10 p-1">
              <TabsTrigger value="rules" className="gap-2 font-bold text-xs sm:text-sm">
                <BookOpen className="h-4 w-4" />
                Game Rules
              </TabsTrigger>
              <TabsTrigger value="dictionary" className="gap-2 font-bold text-xs sm:text-sm">
                <Layers3 className="h-4 w-4" />
                Action Dictionary
              </TabsTrigger>
            </TabsList>
            <TabsContent value="rules" className="mt-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-white/5 bg-zinc-950/20 backdrop-blur">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs">1</span>
                      Turn Start
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-zinc-300 leading-relaxed space-y-2">
                    <p>At the start of your turn, you automatically <strong>draw 2 cards</strong> from the draw pile.</p>
                    <p>If your hand is empty at the start of your turn, you draw <strong>5 cards</strong> instead.</p>
                  </CardContent>
                </Card>

                <Card className="border-white/5 bg-zinc-950/20 backdrop-blur">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs">2</span>
                      Action Phase
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-zinc-300 leading-relaxed space-y-2">
                    <p>Play up to <strong>3 cards</strong> per turn. You can:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Lay down property cards in your sets.</li>
                      <li>Put action/rent cards into your Bank.</li>
                      <li>Execute actions or demand rent from opponents.</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-white/5 bg-zinc-950/20 backdrop-blur">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs">3</span>
                      Turn End & Discard
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-zinc-300 leading-relaxed space-y-2">
                    <p>Once you are finished playing, you must click <strong>End Turn</strong>.</p>
                    <p>If you hold more than <strong>7 cards</strong> at turn end, you must discard the excess down to 7.</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="dictionary" className="mt-4">
              <Card className="border-white/5 bg-zinc-950/20 backdrop-blur p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CARD_DICTIONARY.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-white/5 bg-black/30 p-3 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <p className="font-bold text-sm text-zinc-200">{item.name}</p>
                          <Badge variant="secondary" className="text-[10px] scale-90 bg-zinc-800 border-white/5">
                            {item.kind}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
                      </div>
                      <div className="mt-3 text-right">
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                          Value: {item.val}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Page Footer */}
      <footer className="w-full border-t border-white/5 bg-black/40 py-4 text-center text-[11px] text-zinc-500">
        Monopoly Deal Card Game Engine · Local Single Player Engine vs Bots · Built with React & Tailwind CSS
      </footer>
    </main>
  );
}
