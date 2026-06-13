"use client";

import { useActionState, useEffect } from "react";
import { DoorOpen, Loader2, Plus, Users } from "lucide-react";
import { createRoomAction, joinRoomAction, type RoomActionResult } from "@/app/actions/rooms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_RESULT: RoomActionResult = { ok: false, message: "" };

function useRoomRedirect(result: RoomActionResult) {
  useEffect(() => {
    if (result.ok) {
      window.localStorage.setItem(`deal.room.${result.code}.playerId`, result.playerId);
      window.location.assign(`/room/${result.code}?roomId=${result.roomId}&playerId=${result.playerId}`);
    }
  }, [result]);
}

export function CreateRoomForm() {
  const [result, action, pending] = useActionState(createRoomAction, INITIAL_RESULT);
  useRoomRedirect(result);

  return (
    <Card className="border-white/10 bg-black/30 text-zinc-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-emerald-200" />
          Create Room
        </CardTitle>
        <CardDescription>Generate a short shareable room code after Supabase is configured.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" defaultValue="Host" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxPlayers">Max players</Label>
              <Input id="maxPlayers" name="maxPlayers" type="number" min={2} max={5} defaultValue={5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="botCount">Bots</Label>
              <Input id="botCount" name="botCount" type="number" min={0} max={4} defaultValue={0} />
            </div>
          </div>
          {result.ok === false && result.message && (
            <p className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{result.message}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Create Room
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function JoinRoomForm() {
  const [result, action, pending] = useActionState(joinRoomAction, INITIAL_RESULT);
  useRoomRedirect(result);

  return (
    <Card className="border-white/10 bg-black/30 text-zinc-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-emerald-200" />
          Join Room
        </CardTitle>
        <CardDescription>Enter a room code from another player.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" defaultValue="Player" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Room code</Label>
            <Input id="code" name="code" placeholder="ABCDE" className="font-mono uppercase" />
          </div>
          {result.ok === false && result.message && (
            <p className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{result.message}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
            Join Room
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
