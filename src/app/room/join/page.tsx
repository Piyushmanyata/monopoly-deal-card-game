import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JoinRoomForm } from "@/components/room/room-forms";
import { buttonVariants } from "@/components/ui/button";

export default function JoinRoomPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_10%,rgba(47,163,107,0.24),transparent_32%),linear-gradient(135deg,#06110e,#101817_55%,#160d12)] px-4 py-8 text-zinc-50">
      <div className="w-full max-w-xl space-y-4">
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft className="h-4 w-4" />
          Menu
        </Link>
        <JoinRoomForm />
      </div>
    </main>
  );
}
