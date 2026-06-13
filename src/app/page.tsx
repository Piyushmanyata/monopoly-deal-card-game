import Link from "next/link";
import { Bot, BookOpen, Copy, DoorOpen, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_18%_10%,rgba(47,163,107,0.28),transparent_28%),linear-gradient(135deg,#06110e,#101817_52%,#160d12)] text-zinc-50">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl content-center gap-8 px-5 py-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="space-y-5">
            <Badge className="bg-emerald-300 text-emerald-950">Original browser card game</Badge>
            <div>
              <h1 className="text-5xl font-black tracking-tight sm:text-7xl">DEAL!</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
                Build three property sets, bank cash, charge rent, block huge plays, and outmaneuver sharp bots at a dark felt table.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/play?bots=2" className={buttonVariants({ size: "lg" })}>
                <Bot className="h-5 w-5" />
                Play vs Bots
              </Link>
              <Link href="/room/new" className={buttonVariants({ size: "lg", variant: "secondary" })}>
                <Users className="h-5 w-5" />
                Create Room
              </Link>
              <Link href="/room/join" className={buttonVariants({ size: "lg", variant: "outline" })}>
                <DoorOpen className="h-5 w-5" />
                Join Room
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["#e34040", "#2fa36b", "#2754b8", "#f1c84b", "#d84f9a", "#f6d47a"].map((color, index) => (
              <div
                key={color}
                className="h-40 rounded-lg border border-white/20 bg-[#f8f3e7] p-3 shadow-2xl"
                style={{ transform: `rotate(${[-7, 3, 8, -3, 5, -6][index]}deg)` }}
              >
                <div className="h-8 rounded-md" style={{ backgroundColor: color }} />
                <div className="mt-4 h-3 rounded bg-zinc-900/80" />
                <div className="mt-2 h-3 w-2/3 rounded bg-zinc-900/40" />
                <div className="mt-12 font-mono text-xl font-black text-zinc-950">${index + 1}M</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/10 bg-black/25 text-zinc-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-200" />
                Bot Table
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <p>Single-player runs fully in the browser with the same pure rules engine used by multiplayer.</p>
              <div className="flex gap-2">
                <Link href="/play?bots=1" className={buttonVariants({ size: "sm" })}>
                  1 bot
                </Link>
                <Link href="/play?bots=4" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                  4 bots
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/25 text-zinc-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-amber-200" />
                Room Codes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <p>Room-code multiplayer scaffolding is included and ready for Supabase credentials and schema setup.</p>
              <Link href="/room/new" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                Open room flow
              </Link>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/25 text-zinc-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sky-200" />
                Rule Engine
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <p>Payments, Hard No chains, rent, buildings, wildcards, and win checks are unit-tested.</p>
              <Separator className="bg-white/10" />
              <p className="flex items-center gap-2 text-xs text-zinc-400">
                <Sparkles className="h-4 w-4" />
                Original names and card art avoid Monopoly branding.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
