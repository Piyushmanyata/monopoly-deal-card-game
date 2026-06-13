import { Suspense } from "react";
import { GameClient } from "@/components/game/game-client";

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-50">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-5 py-4 text-sm">Setting the table...</div>
        </main>
      }
    >
      <GameClient />
    </Suspense>
  );
}
