"use client";

import { useState } from "react";
import { RoomLobby } from "./room-lobby";
import { RoomGameClient } from "./room-game-client";
import { type RedactedState } from "@/lib/engine";
import { getMyView } from "@/app/actions/rooms";

type RoomClientWrapperProps = {
  roomId: string;
  playerId: string;
  roomCode: string;
  initialPlayers: any[];
  roomInfo: any;
  isHost: boolean;
  initialGameView: RedactedState | null;
};

export function RoomClientWrapper({
  roomId,
  playerId,
  roomCode,
  initialPlayers,
  roomInfo,
  isHost,
  initialGameView,
}: RoomClientWrapperProps) {
  const [gameView, setGameView] = useState<RedactedState | null>(initialGameView);
  const [status, setStatus] = useState<string>(roomInfo.status);

  const handleGameStart = async () => {
    const view = await getMyView(roomId, playerId);
    if (view) {
      setGameView(view);
      setStatus("in_game");
    }
  };

  if (status === "lobby") {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_18%_10%,rgba(47,163,107,0.24),transparent_32%),linear-gradient(135deg,#06110e,#101817_55%,#160d12)] px-4 py-8 text-zinc-50">
        <div className="mx-auto max-w-5xl space-y-4">
          <RoomLobby
            roomId={roomId}
            playerId={playerId}
            roomCode={roomCode}
            initialPlayers={initialPlayers}
            roomInfo={roomInfo}
            onGameStart={handleGameStart}
          />
        </div>
      </div>
    );
  }

  if (gameView) {
    return (
      <RoomGameClient
        roomId={roomId}
        playerId={playerId}
        initialView={gameView}
        isHost={isHost}
      />
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-50">
      <div className="text-center space-y-4 font-sans">
        <h1 className="text-2xl font-bold">Starting game...</h1>
        <p className="text-zinc-400">Setting up the game session.</p>
      </div>
    </div>
  );
}
