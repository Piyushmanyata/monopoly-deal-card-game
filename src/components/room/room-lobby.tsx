"use client";

import { useEffect, useState, startTransition } from "react";
import { Bot, Check, Copy, Loader2, Play, Users, LogOut, Trash2 } from "lucide-react";
import { addBotAction, removePlayerAction, startRoomGame as startRoomGameAction } from "@/app/actions/rooms";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Player = {
  id: string;
  display_name: string;
  avatar: string;
  seat_index: number;
  is_bot: boolean;
  connected: boolean;
};

type Room = {
  id: string;
  code: string;
  status: string;
  host_player: string;
  config: {
    maxPlayers?: number;
    botCount?: number;
  };
};

type RoomLobbyProps = {
  roomId: string;
  playerId: string;
  roomCode: string;
  initialPlayers: Player[];
  roomInfo: Room;
  onGameStart: (gameId: string) => void;
};

export function RoomLobby({
  roomId,
  playerId,
  roomCode,
  initialPlayers,
  roomInfo,
  onGameStart,
}: RoomLobbyProps) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [room, setRoom] = useState<Room>(roomInfo);
  const [copied, setCopied] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();
  const isHost = room.host_player === playerId;

  const copyInviteLink = () => {
    const link = `${window.location.origin}/room/join?code=${roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Subscribe to real-time changes
  useEffect(() => {
    // Fetch fresh players first
    const fetchPlayers = async () => {
      const { data } = await supabase
        .from("players")
        .select("id, display_name, avatar, seat_index, is_bot, connected")
        .eq("room_id", roomId)
        .order("seat_index", { ascending: true });
      if (data) setPlayers(data as Player[]);
    };

    fetchPlayers();

    // Subscribe to player updates
    const playerChannel = supabase
      .channel(`players-lobby:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    // Subscribe to room status updates (to see when game starts)
    const roomChannel = supabase
      .channel(`room-lobby:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        async (payload) => {
          const updatedRoom = payload.new as Room;
          setRoom(updatedRoom);

          if (updatedRoom.status === "in_game") {
            // Find the game ID
            const { data: game } = await supabase
              .from("games")
              .select("id")
              .eq("room_id", roomId)
              .maybeSingle();

            if (game) {
              onGameStart(game.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomId, supabase, onGameStart]);

  const handleAddBot = async () => {
    setLoadingAction("add-bot");
    const res = await addBotAction(roomId);
    if (!res.ok && res.message) {
      alert(res.message);
    }
    setLoadingAction(null);
  };

  const handleRemovePlayer = async (targetPlayerId: string) => {
    setLoadingAction(`remove-${targetPlayerId}`);
    const res = await removePlayerAction(roomId, targetPlayerId);
    if (!res.ok && res.message) {
      alert(res.message);
    }
    setLoadingAction(null);
  };

  const handleStartGame = async () => {
    if (players.length < 2) {
      alert("You need at least 2 players (including bots) to start the game.");
      return;
    }
    setLoadingAction("start-game");
    const res = await startRoomGameAction(roomId);
    if (!res.ok && res.message) {
      alert(res.message);
    }
    setLoadingAction(null);
  };

  return (
    <Card className="border-white/10 bg-black/40 backdrop-blur-md text-zinc-50 shadow-2xl">
      <CardHeader className="border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-300 animate-pulse" />
              Lobby: {roomCode.toUpperCase()}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Waiting for players to join. Max seats: {room.config?.maxPlayers ?? 5}.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyInviteLink} className="gap-1.5">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied Link!" : "Copy Invite Link"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="rounded-lg bg-zinc-900/30 border border-white/5 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Room Code</span>
            <p className="text-4xl font-mono font-black text-emerald-300 tracking-wider mt-1">{roomCode}</p>
          </div>
          <div className="text-sm text-zinc-300 max-w-md text-center md:text-right">
            Share this code or click the invite link button to copy a direct connection link for other players.
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-1.5">
            Players Joined
            <Badge variant="secondary" className="font-mono text-xs">
              {players.length} / {room.config?.maxPlayers ?? 5}
            </Badge>
          </h3>

          <div className="grid gap-2.5">
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition ${
                  p.id === playerId
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-zinc-950 font-mono text-sm font-black text-zinc-300">
                    {p.avatar}
                  </div>
                  <div>
                    <span className="text-sm font-bold flex items-center gap-2">
                      {p.display_name}
                      {p.id === playerId && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-emerald-500/30 text-emerald-400">
                          You
                        </Badge>
                      )}
                      {p.id === room.host_player && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/30 text-amber-400">
                          Host
                        </Badge>
                      )}
                      {p.is_bot && (
                        <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5">
                          <Bot className="h-2.5 w-2.5" />
                          Bot
                        </Badge>
                      )}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Seat {p.seat_index + 1}
                    </span>
                  </div>
                </div>

                {/* Show kick/delete controls if host, but can't kick self */}
                {isHost && p.id !== playerId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                    disabled={loadingAction !== null}
                    onClick={() => handleRemovePlayer(p.id)}
                  >
                    {loadingAction === `remove-${p.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-white/5" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {isHost ? (
              <p className="text-xs text-zinc-400">You are the host. You can manage bots and start the match.</p>
            ) : (
              <p className="text-xs text-zinc-400">Waiting for host to start the game.</p>
            )}
          </div>
          <div className="flex gap-2">
            {isHost && players.length < (room.config?.maxPlayers ?? 5) && (
              <Button
                variant="outline"
                onClick={handleAddBot}
                disabled={loadingAction !== null}
                className="gap-1.5"
              >
                {loadingAction === "add-bot" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                Add Bot Seat
              </Button>
            )}
            {isHost ? (
              <Button
                onClick={handleStartGame}
                disabled={loadingAction !== null}
                className="gap-1.5 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-bold"
              >
                {loadingAction === "start-game" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Game
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 animate-pulse bg-zinc-900/40 px-3 py-2 rounded-md border border-white/5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for host...
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
