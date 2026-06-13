"use client";

import { motion } from "framer-motion";
import { Ban, Banknote, Building2, HandCoins, Layers3, Repeat2, Sparkles } from "lucide-react";
import { assignableColors, type Card, type PropertyColor } from "@/lib/engine";
import { cn } from "@/lib/utils";

const COLOR_STYLES: Record<PropertyColor, string> = {
  brown: "#815038",
  "light-blue": "#7ed7f3",
  pink: "#d84f9a",
  orange: "#f08a25",
  red: "#e34040",
  yellow: "#f1c84b",
  green: "#2fa36b",
  "dark-blue": "#2754b8",
  railroad: "#2c3035",
  utility: "#9aa4b2",
};

function cardIcon(card: Card) {
  if (card.kind === "money") {
    return <Banknote className="h-4 w-4" />;
  }

  if (card.kind === "rent") {
    return <HandCoins className="h-4 w-4" />;
  }

  if (card.action === "just-say-no") {
    return <Ban className="h-4 w-4" />;
  }

  if (card.action === "house" || card.action === "hotel") {
    return <Building2 className="h-4 w-4" />;
  }

  if (card.action === "forced-deal" || card.action === "sly-deal" || card.action === "deal-breaker") {
    return <Repeat2 className="h-4 w-4" />;
  }

  if (card.kind === "property" || card.kind === "wild") {
    return <Layers3 className="h-4 w-4" />;
  }

  return <Sparkles className="h-4 w-4" />;
}

function labelForKind(card: Card): string {
  if (card.kind === "money") return "Money";
  if (card.kind === "rent") return card.wildRent ? "Wild Rent" : "Rent";
  if (card.kind === "property") return "Property";
  if (card.kind === "wild") return card.isMulticolor ? "Any Color Wild" : "Two-Color Wild";
  return "Action";
}

function bandColors(card: Card): string[] {
  const colors = assignableColors(card);
  if (colors.length === 0) {
    if (card.kind === "money") return ["#f6d47a"];
    if (card.action === "deal-breaker" || card.action === "just-say-no") return ["#f3d36b", "#111827"];
    if (card.kind === "rent") return ["#62d0a5", "#f6d47a"];
    return ["#d9dde6"];
  }

  return colors.map((color) => COLOR_STYLES[color]);
}

type CardViewProps = {
  card?: Card;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  faceDown?: boolean;
  onClick?: () => void;
  className?: string;
};

export function CardView({ card, selected, disabled, compact, faceDown, onClick, className }: CardViewProps) {
  const colors = card ? bandColors(card) : ["#203126", "#111827"];

  return (
    <motion.button
      type="button"
      layout
      whileHover={disabled ? undefined : { y: -8, scale: 1.04, rotate: compact ? 0 : -1, zIndex: 10, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.15), 0 0 15px 3px rgba(52,211,153,0.25)" }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border text-left shadow-[0_12px_32px_rgba(0,0,0,0.32)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        compact ? "h-28 w-20" : "h-44 w-32 sm:h-48 sm:w-36",
        selected ? "border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.3)] scale-[1.02]" : "border-white/20",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        faceDown ? "bg-[#0c1f17]" : "bg-[linear-gradient(to_bottom,#faf7f0,#f4eedc)] text-zinc-950",
        className,
      )}
      aria-label={card ? card.name : "Face-down card"}
    >
      {faceDown || !card ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_35%),linear-gradient(135deg,#163f2b,#091712)] text-emerald-100 p-2 text-center border-4 border-emerald-950/40 rounded-lg">
          <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-emerald-300/30 bg-zinc-900/60 font-mono text-lg font-black shadow-lg">
            D
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/80">Deal</span>
        </div>
      ) : (
        <>
          <div className="absolute inset-0.5 rounded-[6px] border border-zinc-950/5 pointer-events-none" />
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
          <div
            className="h-6.5 w-full border-b border-zinc-950/5"
            style={{
              background:
                colors.length === 1
                  ? colors[0]
                  : `linear-gradient(90deg, ${colors
                      .map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`)
                      .join(", ")})`,
            }}
          />
          <div className="relative flex h-[calc(100%-1.65rem)] flex-col justify-between p-2.5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase leading-none tracking-[0.15em] text-zinc-500">{labelForKind(card)}</p>
                <p className="mt-1 line-clamp-3 text-xs sm:text-[13px] font-black leading-tight tracking-tight text-zinc-900">{card.name}</p>
              </div>
              <div className="grid h-6 w-6 sm:h-6.5 sm:w-6.5 shrink-0 place-items-center rounded-md bg-zinc-950 text-amber-200 shadow">{cardIcon(card)}</div>
            </div>
            <div className="flex items-end justify-between">
              <div className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-bold text-amber-200 shadow">
                ${card.value}M
              </div>
              {(card.kind === "property" || card.kind === "wild") && (
                <div className="text-right text-[8px] font-black uppercase leading-tight text-zinc-400">
                  {assignableColors(card).length} color{assignableColors(card).length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </motion.button>
  );
}

export function propertyColorStyle(color: PropertyColor): string {
  return COLOR_STYLES[color];
}
