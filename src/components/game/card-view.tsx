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
  if (card.kind === "wild") return card.isMulticolor ? "Any Wild" : "Wildcard";
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
  const primaryColor = colors[0] ?? "#10b981";

  const hoverEffect = disabled
    ? undefined
    : {
        y: -8,
        scale: 1.04,
        rotate: compact ? 0 : -1.2,
        zIndex: 10,
        boxShadow: `0 20px 30px -5px rgba(0,0,0,0.65), 0 0 20px 2px ${primaryColor}55`,
      };

  return (
    <motion.button
      type="button"
      layout
      whileHover={hoverEffect}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border text-left shadow-[0_12px_24px_rgba(0,0,0,0.42)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 select-none",
        compact ? "h-28 w-20" : "h-44 w-30 sm:h-48 sm:w-34",
        selected ? "border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_25px_rgba(52,211,153,0.45)] scale-[1.03] -translate-y-2 z-10" : "border-white/10",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        faceDown ? "bg-[#091712]" : "bg-[linear-gradient(to_bottom,#fcfaf5,#f3ede0)] text-zinc-950",
        className,
      )}
      aria-label={card ? card.name : "Face-down card"}
    >
      {faceDown || !card ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.2),transparent_60%),linear-gradient(135deg,#0a2f1d,#04110b)] text-emerald-100 p-2 text-center border-4 border-emerald-950/50 rounded-lg relative overflow-hidden">
          <div className="absolute inset-0.5 border border-emerald-500/20 rounded-[4px] pointer-events-none" />
          <div className="absolute inset-1.5 border border-dashed border-emerald-500/10 rounded-[3px] pointer-events-none" />
          
          <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-emerald-400/40 bg-zinc-950/80 font-black text-lg text-emerald-300 shadow-2xl tracking-widest relative z-10">
            D
          </div>
          <span className="text-[8px] font-black uppercase tracking-[0.25em] text-emerald-400/70 relative z-10">DEAL</span>
        </div>
      ) : (
        <>
          {/* Embossed border overlays */}
          <div className="absolute inset-0.5 rounded-[6px] border border-zinc-950/10 pointer-events-none" />
          <div className="absolute inset-1 rounded-[5px] border border-white/50 pointer-events-none" />
          <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
          
          {/* Card Category Band */}
          <div
            className="h-6 w-full border-b border-zinc-950/15"
            style={{
              background:
                colors.length === 1
                  ? colors[0]
                  : `linear-gradient(90deg, ${colors
                      .map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`)
                      .join(", ")})`,
            }}
          />
          
          <div className="relative flex h-[calc(100%-1.5rem)] flex-col justify-between p-2.5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[7.5px] font-extrabold uppercase leading-none tracking-[0.12em] text-zinc-500">{labelForKind(card)}</p>
                <p className="mt-1 line-clamp-3 text-[11px] sm:text-[12px] font-black leading-tight tracking-tight text-zinc-900">{card.name}</p>
              </div>
              <div className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded-md bg-zinc-950 text-amber-300 shadow-lg border border-white/10">{cardIcon(card)}</div>
            </div>
            
            <div className="flex items-end justify-between mt-1">
              <div className="rounded-md bg-zinc-950 px-2 py-0.5 font-mono text-[9.5px] sm:text-[10.5px] font-black text-amber-300 shadow border border-white/5">
                ${card.value}M
              </div>
              {(card.kind === "property" || card.kind === "wild") && (
                <div className="text-right text-[7.5px] font-extrabold uppercase leading-tight text-zinc-400">
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
