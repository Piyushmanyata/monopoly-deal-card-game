import Link from "next/link";
import fs from "fs";
import path from "path";
import { ArrowLeft } from "lucide-react";
import { hasServerSupabaseEnv, getSupabaseAdminClient } from "@/lib/supabase/server";
import { getMyView } from "@/app/actions/rooms";
import { buttonVariants } from "@/components/ui/button";
import { SupabaseSetupWizard } from "@/components/room/supabase-setup-wizard";
import { RoomClientWrapper } from "@/components/room/room-client-wrapper";

type RoomPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ roomId?: string; playerId?: string }>;
};

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const { code } = await params;
  const { roomId, playerId } = await searchParams;
  const configured = hasServerSupabaseEnv();

  let schemaSql = "";
  try {
    const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
    schemaSql = fs.readFileSync(schemaPath, "utf8");
  } catch {
    schemaSql = "-- Could not read schema.sql file";
  }

  if (!configured) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_18%_10%,rgba(47,163,107,0.24),transparent_32%),linear-gradient(135deg,#06110e,#101817_55%,#160d12)] px-4 py-8 text-zinc-50 font-sans">
        <div className="mx-auto max-w-5xl space-y-4">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="h-4 w-4" />
            Menu
          </Link>
          <SupabaseSetupWizard envStatus={{
            url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          }} schemaSql={schemaSql} />
        </div>
      </main>
    );
  }

  if (!roomId || !playerId) {
    return (
      <main className="min-h-screen grid place-items-center bg-zinc-950 text-zinc-50 font-sans">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-zinc-400">Please join the room through the proper join or create forms.</p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>Back to Menu</Link>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return (
      <main className="min-h-screen grid place-items-center bg-zinc-950 text-zinc-50 font-sans">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Room not found</h1>
          <p className="text-zinc-400">The room does not exist or has been deleted.</p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>Back to Menu</Link>
        </div>
      </main>
    );
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, avatar, seat_index, is_bot, connected")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });

  const initialGameView = room.status === "in_game" ? await getMyView(roomId, playerId) : null;
  const isHost = room.host_player === playerId;

  return (
    <RoomClientWrapper
      roomId={roomId}
      playerId={playerId}
      roomCode={code}
      initialPlayers={players ?? []}
      roomInfo={room}
      isHost={isHost}
      initialGameView={initialGameView ?? null}
    />
  );
}
