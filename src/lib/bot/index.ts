import {
  applyMove,
  bankTotal,
  chooseAutoPayment,
  completeSetColors,
  getLegalMoves,
  isGameOver,
  rentForColor,
  type GameState,
  type Move,
  type PlayPropertyMove,
  type PropertyColor,
} from "@/lib/engine";

export type BotDifficulty = "easy" | "normal" | "hard";

function randomNoise(difficulty: BotDifficulty): number {
  if (difficulty === "hard") {
    return Math.random() * 0.75;
  }

  if (difficulty === "normal") {
    return Math.random() * 2;
  }

  return Math.random() * 6;
}

function scoreReassignWild(state: GameState, move: Move & { type: "reassign_wild" }): number {
  const player = state.players.find((candidate) => candidate.id === move.playerId);
  if (!player) {
    return -100;
  }

  const entry = player.properties.find((candidate) => candidate.card.id === move.cardId);
  if (!entry) {
    return -100;
  }

  const colors: PropertyColor[] = [
    "dark-blue",
    "green",
    "red",
    "yellow",
    "orange",
    "pink",
    "light-blue",
    "brown",
    "railroad",
    "utility",
  ];

  const beforeComplete = completeSetColors(player).length;
  const beforeRentTotal = colors.reduce((sum, color) => sum + rentForColor(player, color), 0);

  try {
    const afterState = applyMove(state, move).state;
    const afterPlayer = afterState.players.find((candidate) => candidate.id === move.playerId);
    if (!afterPlayer) {
      return -100;
    }

    const afterComplete = completeSetColors(afterPlayer).length;
    const afterRentTotal = colors.reduce((sum, color) => sum + rentForColor(afterPlayer, color), 0);

    if (afterComplete > beforeComplete) {
      return 45;
    }

    if (afterRentTotal > beforeRentTotal) {
      return 25;
    }

    if (afterComplete < beforeComplete || afterRentTotal < beforeRentTotal) {
      return -50;
    }

    // No actual change in complete sets or rent. It's useless.
    return -20;
  } catch {
    return -100;
  }
}

function scorePropertyMove(state: GameState, move: PlayPropertyMove): number {
  const player = state.players.find((candidate) => candidate.id === move.playerId);
  const card = player?.hand.find((candidate) => candidate.id === move.cardId);
  if (!player || !card) {
    return 0;
  }

  const before = completeSetColors(player).length;
  const afterState = applyMove(state, move).state;
  const afterPlayer = afterState.players.find((candidate) => candidate.id === move.playerId);
  const after = afterPlayer ? completeSetColors(afterPlayer).length : before;
  const setProgress = afterPlayer
    ? afterPlayer.properties.filter((entry) => entry.assignedColor === move.assignedColor).length
    : 0;

  return 12 + card.value + setProgress * 2 + (after > before ? 28 : 0);
}

function moveScore(state: GameState, move: Move, difficulty: BotDifficulty): number {
  const player = state.players.find((candidate) => candidate.id === move.playerId);
  if (!player) {
    return -100;
  }

  if (move.type === "draw") {
    return 100;
  }

  if (move.type === "pay") {
    return 95;
  }

  if (move.type === "respond_jsn") {
    if (!move.useCardId) {
      return 1;
    }

    const pending = state.pendingInteraction?.kind === "just_say_no" ? state.pendingInteraction : undefined;
    if (!pending) {
      return 0;
    }

    if (pending.effect.kind === "deal-breaker") {
      return 90;
    }

    if (pending.effect.kind === "charge") {
      return pending.effect.amount >= 4 ? 75 : 12;
    }

    return difficulty === "easy" ? 8 : 55;
  }

  if (move.type === "discard") {
    return 90;
  }

  if (move.type === "end_turn") {
    return state.playsRemaining <= 0 || player.hand.length === 0 ? 70 : -4;
  }

  try {
    const afterState = applyMove(state, move).state;
    if (isGameOver(afterState).winnerId === move.playerId) {
      return 1000;
    }
  } catch {
    return -100;
  }

  if (move.type === "play_property") {
    return scorePropertyMove(state, move);
  }

  if (move.type === "reassign_wild") {
    return scoreReassignWild(state, move);
  }

  if (move.type === "play_pass_go") {
    return 32;
  }

  if (move.type === "play_to_bank") {
    const card = player.hand.find((candidate) => candidate.id === move.cardId);
    const liquid = bankTotal(player);
    return (card?.value ?? 0) + (liquid < 5 ? 16 : 3);
  }

  if (move.type === "play_rent") {
    const expectedRent = rentForColor(player, move.color) * (move.doubleRentCardId ? 2 : 1);
    return 30 + expectedRent * 5 + (move.doubleRentCardId ? 8 : 0);
  }

  if (move.type === "play_deal_breaker") {
    return difficulty === "easy" ? 35 : 110;
  }

  if (move.type === "play_sly_deal") {
    return difficulty === "easy" ? 22 : 58;
  }

  if (move.type === "play_forced_deal") {
    return difficulty === "easy" ? 12 : 42;
  }

  if (move.type === "play_debt_collector") {
    return 46;
  }

  if (move.type === "play_birthday") {
    return 42 + (state.players.length - 2) * 10;
  }

  if (move.type === "play_house" || move.type === "play_hotel") {
    return 40;
  }

  return 0;
}

function assignedColorForMove(move: Move): PropertyColor | undefined {
  if (move.type === "play_property" || move.type === "reassign_wild") {
    return move.assignedColor;
  }

  return undefined;
}

function preferColorAssignment(moves: Move[]): Move[] {
  const colorPriority: PropertyColor[] = [
    "dark-blue",
    "green",
    "red",
    "yellow",
    "orange",
    "pink",
    "light-blue",
    "brown",
    "railroad",
    "utility",
  ];

  return [...moves].sort((left, right) => {
    const leftAssignedColor = assignedColorForMove(left);
    const rightAssignedColor = assignedColorForMove(right);
    const leftColor = leftAssignedColor ? colorPriority.indexOf(leftAssignedColor) : 99;
    const rightColor = rightAssignedColor ? colorPriority.indexOf(rightAssignedColor) : 99;
    return leftColor - rightColor;
  });
}

export function chooseBotMove(state: GameState, playerId: string, difficulty: BotDifficulty = "normal"): Move | undefined {
  const legalMoves = preferColorAssignment(getLegalMoves(state, playerId));
  if (legalMoves.length === 0) {
    return undefined;
  }

  if (state.pendingInteraction?.kind === "payment" && state.pendingInteraction.debt.debtorId === playerId) {
    return {
      type: "pay",
      playerId,
      cardIds: chooseAutoPayment(
        state.players.find((player) => player.id === playerId)!,
        state.pendingInteraction.debt.amount,
      ),
    };
  }

  return legalMoves
    .map((move) => ({
      move,
      score: moveScore(state, move, difficulty) + randomNoise(difficulty),
    }))
    .sort((left, right) => right.score - left.score)[0]?.move;
}
