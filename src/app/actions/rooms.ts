"use server";

import {
  applyMove,
  createInitialState,
  isMoveLegal,
  redactStateFor,
  type GameState,
  type Move,
  type PublicPlayer,
  type RedactedState,
} from "@/lib/engine";
import { getSupabaseAdminClient, hasServerSupabaseEnv } from "@/lib/supabase/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RoomActionResult =
  | { ok: true; roomId: string; code: string; playerId: string }
  | { ok: false; message: string };

type PlayerRow = {
  id: string;
  display_name: string;
  avatar: string;
  seat_index: number;
  is_bot: boolean;
};

type GameRow = {
  id: string;
  room_id: string;
  state: GameState;
  version: number;
};

function roomCode(): string {
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function readText(formData: FormData, key: string, fallback: string): string {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 32) : fallback;
}

async function uniqueRoomCode(): Promise<string> {
  const supabase = getSupabaseAdminClient();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = roomCode();
    const { data, error } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle();
    if (error) {
      throw error;
    }

    if (!data) {
      return code;
    }
  }

  throw new Error("Could not allocate a room code");
}

export async function createRoomAction(_previousState: RoomActionResult, formData: FormData): Promise<RoomActionResult> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  const supabase = getSupabaseAdminClient();
  const code = await uniqueRoomCode();
  const playerId = crypto.randomUUID();
  const displayName = readText(formData, "displayName", "Host");
  const botCount = Math.max(0, Math.min(Number(formData.get("botCount") ?? 0) || 0, 4));
  const maxPlayers = Math.max(2, Math.min(Number(formData.get("maxPlayers") ?? 5) || 5, 5));

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({
      code,
      status: "lobby",
      host_player: playerId,
      config: { maxPlayers, botCount, houseRules: { orphanBuildingsToBank: true } },
    })
    .select("id, code")
    .single();

  if (roomError || !room) {
    return { ok: false, message: roomError?.message ?? "Could not create room" };
  }

  const { error: playerError } = await supabase.from("players").insert({
    id: playerId,
    room_id: room.id,
    display_name: displayName,
    avatar: displayName.slice(0, 1).toUpperCase(),
    seat_index: 0,
    is_bot: false,
    connected: true,
    last_seen: new Date().toISOString(),
  });

  if (playerError) {
    return { ok: false, message: playerError.message };
  }

  return { ok: true, roomId: room.id as string, code: room.code as string, playerId };
}

export async function joinRoomAction(_previousState: RoomActionResult, formData: FormData): Promise<RoomActionResult> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  const supabase = getSupabaseAdminClient();
  const code = readText(formData, "code", "").toUpperCase();
  const displayName = readText(formData, "displayName", "Player");

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, status, config")
    .eq("code", code)
    .single();

  if (roomError || !room) {
    return { ok: false, message: "Room not found" };
  }

  if (room.status !== "lobby") {
    return { ok: false, message: "This room is already in game" };
  }

  const { data: seats, error: seatsError } = await supabase
    .from("players")
    .select("seat_index")
    .eq("room_id", room.id)
    .order("seat_index", { ascending: true });

  if (seatsError) {
    return { ok: false, message: seatsError.message };
  }

  const usedSeats = new Set((seats ?? []).map((seat) => seat.seat_index as number));
  const maxPlayers = typeof room.config === "object" && room.config && "maxPlayers" in room.config
    ? Number(room.config.maxPlayers)
    : 5;
  const seatIndex = Array.from({ length: maxPlayers }, (_, index) => index).find((index) => !usedSeats.has(index));
  if (seatIndex === undefined) {
    return { ok: false, message: "Room is full" };
  }

  const playerId = crypto.randomUUID();
  const { error: playerError } = await supabase.from("players").insert({
    id: playerId,
    room_id: room.id,
    display_name: displayName,
    avatar: displayName.slice(0, 1).toUpperCase(),
    seat_index: seatIndex,
    is_bot: false,
    connected: true,
    last_seen: new Date().toISOString(),
  });

  if (playerError) {
    return { ok: false, message: playerError.message };
  }

  return { ok: true, roomId: room.id as string, code: room.code as string, playerId };
}

export async function startRoomGame(roomId: string): Promise<{ ok: true; view: RedactedState } | { ok: false; message: string }> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  const supabase = getSupabaseAdminClient();
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, avatar, seat_index, is_bot")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });

  if (playersError || !players || players.length < 2) {
    return { ok: false, message: playersError?.message ?? "A game needs at least 2 players" };
  }

  // Check if game already exists (defensive check against double clicks)
  const { data: existingGame } = await supabase
    .from("games")
    .select("id")
    .eq("room_id", roomId)
    .maybeSingle();

  if (existingGame) {
    const view = await getMyView(roomId, players[0].id);
    if (view) {
      return { ok: true, view };
    }
  }

  const publicPlayers: PublicPlayer[] = (players as PlayerRow[]).map((player) => ({
    id: player.id,
    name: player.display_name,
    avatar: player.avatar,
    isBot: player.is_bot,
  }));
  const state = createInitialState({ players: publicPlayers, seed: Date.now() % 2147483647 });

  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      room_id: roomId,
      state,
      version: state.version,
      turn_player: state.players[state.currentPlayerIndex].id,
      phase: state.phase,
    })
    .select("id")
    .single();

  if (gameError || !game) {
    return { ok: false, message: gameError?.message ?? "Could not start game" };
  }

  await supabase.from("rooms").update({ status: "in_game", updated_at: new Date().toISOString() }).eq("id", roomId);
  const view = redactStateFor(state, state.players[0].id);
  view.id = game.id;
  return { ok: true, view };
}

export async function getMyView(roomId: string, playerId: string): Promise<RedactedState | undefined> {
  if (!hasServerSupabaseEnv()) {
    return undefined;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, room_id, state, version")
    .eq("room_id", roomId)
    .single();

  if (error || !data) {
    return undefined;
  }

  const game = data as GameRow;
  const view = redactStateFor(game.state, playerId);
  view.id = game.id;
  return view;
}

export async function submitMoveAction(
  roomId: string,
  playerId: string,
  expectedVersion: number,
  move: Move,
): Promise<{ ok: true; view: RedactedState } | { ok: false; message: string }> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  if (move.playerId !== playerId) {
    return { ok: false, message: "Move player does not match the authenticated seat" };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, room_id, state, version")
    .eq("room_id", roomId)
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Game not found" };
  }

  const game = data as GameRow;
  if (game.version !== expectedVersion) {
    return { ok: false, message: "Stale client version. Refetch the room state." };
  }

  if (!isMoveLegal(game.state, move)) {
    return { ok: false, message: "Illegal move" };
  }

  const result = applyMove(game.state, move);
  const nextPlayerId = result.state.players[result.state.currentPlayerIndex].id;
  const { error: updateError } = await supabase
    .from("games")
    .update({
      state: result.state,
      version: result.state.version,
      turn_player: nextPlayerId,
      phase: result.state.phase,
      updated_at: new Date().toISOString(),
    })
    .eq("id", game.id)
    .eq("version", expectedVersion);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  await supabase.from("moves").insert({
    game_id: game.id,
    version: result.state.version,
    player_id: playerId,
    move,
    events: result.events,
  });

  const view = redactStateFor(result.state, playerId);
  view.id = game.id;
  return { ok: true, view };
}

export async function addBotAction(roomId: string): Promise<{ ok: boolean; message?: string }> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  const supabase = getSupabaseAdminClient();
  
  const { data: seats, error: seatsError } = await supabase
    .from("players")
    .select("seat_index")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });

  if (seatsError) {
    return { ok: false, message: seatsError.message };
  }

  const usedSeats = new Set((seats ?? []).map((seat) => seat.seat_index as number));
  const seatIndex = [0, 1, 2, 3, 4].find((index) => !usedSeats.has(index));
  if (seatIndex === undefined) {
    return { ok: false, message: "Room is full" };
  }

  const botId = crypto.randomUUID();
  const botNames = ["Soft Bot", "Steady Bot", "Sharp Bot", "Clever Bot", "Swift Bot"];
  const displayName = botNames[seatIndex % botNames.length] + " " + seatIndex;
  
  const { error: playerError } = await supabase.from("players").insert({
    id: botId,
    room_id: roomId,
    display_name: displayName,
    avatar: String(seatIndex + 1),
    seat_index: seatIndex,
    is_bot: true,
    connected: true,
    last_seen: new Date().toISOString(),
  });

  if (playerError) {
    return { ok: false, message: playerError.message };
  }

  return { ok: true };
}

export async function removePlayerAction(roomId: string, playerIdToRemove: string): Promise<{ ok: boolean; message?: string }> {
  if (!hasServerSupabaseEnv()) {
    return { ok: false, message: "Supabase environment variables are not configured yet." };
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("players").delete().eq("room_id", roomId).eq("id", playerIdToRemove);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
