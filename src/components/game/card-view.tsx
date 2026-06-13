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

function cardIcon(card: Card, size: "xs" | "sm" | "md" | "lg") {
  const iconClass = cn(
    size === "xs" ? "h-2 w-2" : size === "sm" ? "h-3 w-3" : size === "md" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
  );
  if (card.kind === "money") {
    return <Banknote className={iconClass} />;
  }

  if (card.kind === "rent") {
    return <HandCoins className={iconClass} />;
  }

  if (card.action === "just-say-no") {
    return <Ban className={iconClass} />;
  }

  if (card.action === "house" || card.action === "hotel") {
    return <Building2 className={iconClass} />;
  }

  if (card.action === "forced-deal" || card.action === "sly-deal" || card.action === "deal-breaker") {
    return <Repeat2 className={iconClass} />;
  }

  if (card.kind === "property" || card.kind === "wild") {
    return <Layers3 className={iconClass} />;
  }

  return <Sparkles className={iconClass} />;
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
  size?: "xs" | "sm" | "md" | "lg";
  faceDown?: boolean;
  onClick?: () => void;
  className?: string;
};

export function CardView({ card, selected, disabled, size = "lg", faceDown, onClick, className }: CardViewProps) {
  const colors = card ? bandColors(card) : ["#203126", "#111827"];
  const primaryColor = colors[0] ?? "#10b981";

  const hoverEffect = disabled
    ? undefined
    : {
        y: -6,
        scale: 1.03,
        rotate: size === "sm" || size === "xs" ? 0 : -1,
        zIndex: 15,
        boxShadow: `0 15px 25px -5px rgba(0,0,0,0.6), 0 0 16px 2px ${primaryColor}44`,
      };

  // Dimensional styles mapping
  const sizeClasses = {
    xs: "h-12 w-[36px] rounded-xs text-[6px] shadow-xs",
    sm: "h-24 w-[68px] rounded-md text-[9px] shadow-md",
    md: "h-32 w-[92px] rounded-lg text-[10px] shadow-lg",
    lg: "h-44 w-[128px] sm:h-48 sm:w-[136px] rounded-xl text-[12px] shadow-xl",
  };

  const headerHeights = {
    xs: "h-2",
    sm: "h-3.5",
    md: "h-5",
    lg: "h-6.5",
  };

  const iconContainers = {
    xs: "h-3 w-3 rounded text-amber-300",
    sm: "h-4.5 w-4.5 rounded text-amber-300",
    md: "h-5.5 w-5.5 rounded-md text-amber-300",
    lg: "h-6.5 w-6.5 rounded-md text-amber-300",
  };

  const paddings = {
    xs: "p-0.5",
    sm: "p-1.5",
    md: "p-2",
    lg: "p-2.5",
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
        "relative shrink-0 overflow-hidden border text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 select-none",
        sizeClasses[size],
        selected
          ? "border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.4)] scale-[1.03] z-10"
          : "border-white/10",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        faceDown ? "bg-[#091712]" : "bg-[linear-gradient(to_bottom,#fcfaf5,#f3ede0)] text-zinc-950",
        className,
      )}
      aria-label={card ? card.name : "Face-down card"}
    >
      {faceDown || !card ? (
        <div className={cn(
          "flex h-full w-full flex-col items-center justify-center text-emerald-100 text-center relative overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(16,185,129,0.2),transparent_60%),linear-gradient(135deg,#0a2f1d,#04110b)] border-2 border-emerald-950/50",
          size === "xs" ? "p-0 rounded-2xs border" : size === "sm" ? "p-1 rounded-sm border" : "p-2 rounded-lg border-4"
        )}>
          <div className={cn("absolute inset-0.5 border border-emerald-500/10 pointer-events-none", size === "xs" || size === "sm" ? "rounded-2xs" : "rounded-[4px]")} />
          
          <div className={cn(
            "grid place-items-center rounded-full border border-emerald-400/30 bg-zinc-950/80 font-black text-emerald-300 shadow-2xl tracking-widest relative z-10",
            size === "xs" ? "h-4 w-4 text-[7px]" : size === "sm" ? "h-6 w-6 text-[9px]" : size === "md" ? "h-8 w-8 text-xs" : "h-10 w-10 text-base"
          )}>
            D
          </div>
          {size !== "xs" && size !== "sm" && (
            <span className={cn("font-black uppercase tracking-[0.25em] text-emerald-400/60 relative z-10", size === "md" ? "text-[6px]" : "text-[8px]")}>
              DEAL
            </span>
          )}
        </div>
      ) : (
        <>
          {/* Inner embossed borders */}
          <div className={cn("absolute inset-0.5 pointer-events-none border border-zinc-950/10", size === "xs" ? "rounded-2xs" : size === "sm" ? "rounded-[4px]" : "rounded-[6px]")} />
          {size !== "xs" && size !== "sm" && <div className="absolute inset-1 rounded-[5px] border border-white/50 pointer-events-none" />}
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:5px_5px] pointer-events-none" />
          
          {/* Card Category Color Band */}
          <div
            className={cn("w-full border-b border-zinc-950/15", headerHeights[size])}
            style={{
              background:
                colors.length === 1
                  ? colors[0]
                  : `linear-gradient(90deg, ${colors
                      .map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`)
                      .join(", ")})`,
            }}
          />
          
          <div className={cn("relative flex flex-col justify-between w-full", size === "xs" ? "h-[calc(100%-0.5rem)]" : size === "sm" ? "h-[calc(100%-0.875rem)]" : size === "md" ? "h-[calc(100%-1.25rem)]" : "h-[calc(100%-1.625rem)]", paddings[size])}>
            {size === "xs" ? (
              <div className="flex flex-col items-center justify-between h-full w-full py-0.5">
                <div className="grid place-items-center bg-zinc-950 shadow-xs border border-white/5 h-4 w-4 rounded text-amber-300 shrink-0">
                  {cardIcon(card, "xs")}
                </div>
                <div className="rounded bg-zinc-950 font-mono font-black text-amber-300 text-[6px] px-0.5 leading-none mt-0.5">
                  ${card.value}M
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-0.5">
                  <div className="min-w-0">
                    {size !== "sm" && (
                      <p className={cn("font-extrabold uppercase leading-none tracking-[0.1em] text-zinc-500", size === "md" ? "text-[6px]" : "text-[7.5px]")}>
                        {labelForKind(card)}
                      </p>
                    )}
                    <p className={cn(
                      "font-black leading-tight tracking-tight text-zinc-900",
                      size === "sm" ? "text-[8px] line-clamp-2 mt-0.5" : size === "md" ? "text-[10px] line-clamp-2 mt-0.5" : "text-[11.5px] sm:text-[12.5px] line-clamp-3 mt-1"
                    )}>
                      {card.name}
                    </p>
                  </div>
                  <div className={cn("grid shrink-0 place-items-center bg-zinc-950 shadow-md border border-white/5", iconContainers[size])}>
                    {cardIcon(card, size)}
                  </div>
                </div>
                
                <div className="flex items-end justify-between mt-0.5">
                  <div className={cn(
                    "rounded bg-zinc-950 font-mono font-black text-amber-300 shadow border border-white/5 leading-none",
                    size === "sm" ? "px-1 py-0.5 text-[8px]" : size === "md" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
                  )}>
                    ${card.value}M
                  </div>
                  
                  {size === "lg" && (card.kind === "property" || card.kind === "wild") && (
                    <div className="text-right text-[7.5px] font-extrabold uppercase leading-none text-zinc-400">
                      {assignableColors(card).length} color{assignableColors(card).length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </motion.button>
  );
}

export function propertyColorStyle(color: PropertyColor): string {
  return COLOR_STYLES[color];
}
