import {
  PROPERTY_FACE_VALUE,
  RENT_CHART,
  SET_SIZE,
  createShuffledDeck,
  shuffleCards,
} from "./deck";
import {
  PROPERTY_COLORS,
  type BuildingCard,
  type Card,
  type ChargeEffect,
  type GameConfig,
  type GameEvent,
  type GameState,
  type Move,
  type PaymentRequest,
  type PendingInteraction,
  type PlayerState,
  type PropertyColor,
  type PublicPlayer,
  type RedactedState,
  type TargetedEffect,
  type TableauCard,
} from "./types";

export * from "./deck";
export * from "./types";

const DEFAULT_AVATARS = ["A", "K", "M", "R", "S"];

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertRule(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function currentPlayer(state: GameState): PlayerState {
  const player = state.players[state.currentPlayerIndex];
  assertRule(Boolean(player), "Current player is missing");
  return player;
}

function findPlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

function otherPlayers(state: GameState, playerId: string): PlayerState[] {
  return state.players.filter((player) => player.id !== playerId);
}

function pushEvent(
  state: GameState,
  events: GameEvent[],
  event: Omit<GameEvent, "id">,
): void {
  events.push({
    id: `v${state.version + 1}-${events.length + 1}`,
    ...event,
  });
}

function playerLabel(state: GameState, playerId: string): string {
  return findPlayer(state, playerId).name;
}

export function canAssignCard(card: Card, color: PropertyColor): boolean {
  return Boolean(card.colors?.includes(color));
}

export function assignableColors(card: Card): PropertyColor[] {
  if (card.kind === "property" || card.kind === "wild") {
    return card.colors ? [...card.colors] : [];
  }

  return [];
}

export function isPropertyLike(card: Card): boolean {
  return card.kind === "property" || card.kind === "wild";
}

export function canBankCard(card: Card): boolean {
  return (card.kind === "money" || card.kind === "action" || card.kind === "rent") && card.value > 0;
}

export function bankTotal(player: PlayerState): number {
  return player.bank.reduce((total, card) => total + card.value, 0);
}

export function propertyCardsFor(player: PlayerState, color: PropertyColor): TableauCard[] {
  return player.properties.filter((entry) => entry.assignedColor === color);
}

export function hasHouse(player: PlayerState, color: PropertyColor): boolean {
  return player.buildings.some((building) => building.color === color && building.card.action === "house");
}

export function hasHotel(player: PlayerState, color: PropertyColor): boolean {
  return player.buildings.some((building) => building.color === color && building.card.action === "hotel");
}

export function isCompleteSet(player: PlayerState, color: PropertyColor): boolean {
  const entries = propertyCardsFor(player, color);
  const hasEnough = entries.length >= SET_SIZE[color];
  const onlyPrismaticWilds = entries.length > 0 && entries.every((entry) => entry.card.isMulticolor);
  return hasEnough && !onlyPrismaticWilds;
}

export function completeSetColors(player: PlayerState): PropertyColor[] {
  return PROPERTY_COLORS.filter((color) => isCompleteSet(player, color));
}

export function rentForColor(player: PlayerState, color: PropertyColor): number {
  const entries = propertyCardsFor(player, color);
  if (entries.length === 0) {
    return 0;
  }

  const rentRow = RENT_CHART[color];
  const rentIndex = Math.min(entries.length, rentRow.length) - 1;
  const buildingBonus = (hasHouse(player, color) ? 3 : 0) + (hasHotel(player, color) ? 4 : 0);
  return rentRow[rentIndex] + buildingBonus;
}

export function playerNetWorth(player: PlayerState): number {
  return (
    bankTotal(player) +
    player.properties.reduce((total, entry) => total + entry.card.value, 0) +
    player.buildings.reduce((total, entry) => total + entry.card.value, 0)
  );
}

function setupPlayers(config: GameConfig): PublicPlayer[] {
  if (config.players && config.players.length > 0) {
    return config.players.slice(0, 5);
  }

  const botCount = Math.max(1, Math.min(config.botCount ?? 2, 4));
  const count = Math.max(2, Math.min(config.playerCount ?? botCount + 1, 5));

  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "human" : `bot-${index}`,
    name: index === 0 ? "You" : `Bot ${index}`,
    avatar: DEFAULT_AVATARS[index] ?? `${index + 1}`,
    isBot: index !== 0,
  }));
}

export function createInitialState(config: GameConfig = {}): GameState {
  const publicPlayers = setupPlayers(config);
  assertRule(publicPlayers.length >= 2 && publicPlayers.length <= 5, "Game requires 2 to 5 players");

  const { deck: shuffledDeck, seed } = createShuffledDeck(config.seed);
  const players: PlayerState[] = publicPlayers.map((player) => ({
    ...player,
    hand: [],
    bank: [],
    properties: [],
    buildings: [],
    connected: true,
  }));

  const deck = [...shuffledDeck];
  for (let round = 0; round < 5; round += 1) {
    for (const player of players) {
      const card = deck.shift();
      if (!card) {
        throw new Error("Deck exhausted during setup");
      }
      player.hand.push(card);
    }
  }

  return {
    id: `game-${seed}`,
    config: {
      houseRules: {
        orphanBuildingsToBank: config.houseRules?.orphanBuildingsToBank ?? true,
      },
    },
    players,
    deck,
    discard: [],
    currentPlayerIndex: 0,
    phase: "draw",
    turnNumber: 1,
    playsRemaining: 3,
    log: [],
    version: 0,
    rngSeed: seed,
  };
}

function removeHandCard(player: PlayerState, cardId: string): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  assertRule(index >= 0, `${player.name} does not have card ${cardId} in hand`);
  const [card] = player.hand.splice(index, 1);
  assertRule(Boolean(card), `${player.name} does not have card ${cardId} in hand`);
  return card;
}

function removeBankCard(player: PlayerState, cardId: string): Card | undefined {
  const index = player.bank.findIndex((card) => card.id === cardId);
  if (index < 0) {
    return undefined;
  }

  const [card] = player.bank.splice(index, 1);
  assertRule(Boolean(card), `${player.name} does not have bank card ${cardId}`);
  return card;
}

function removePropertyCard(player: PlayerState, cardId: string): TableauCard | undefined {
  const index = player.properties.findIndex((entry) => entry.card.id === cardId);
  if (index < 0) {
    return undefined;
  }

  const [entry] = player.properties.splice(index, 1);
  assertRule(Boolean(entry), `${player.name} does not have property ${cardId}`);
  return entry;
}

function findPropertyCard(player: PlayerState, cardId: string): TableauCard {
  const entry = player.properties.find((candidate) => candidate.card.id === cardId);
  if (!entry) {
    throw new Error(`${player.name} does not have property ${cardId}`);
  }
  return entry;
}

function findHandAction(player: PlayerState, cardId: string, action: Card["action"]): Card {
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new Error(`${player.name} does not have card ${cardId}`);
  }
  assertRule(card.action === action, `Expected ${action} card`);
  return card;
}

function assertCurrentPlayable(state: GameState, playerId: string, plays = 1): PlayerState {
  const player = findPlayer(state, playerId);
  assertRule(state.phase === "play", "Cards can only be played during the play phase");
  assertRule(currentPlayer(state).id === playerId, "It is not this player's turn");
  assertRule(state.playsRemaining >= plays, "No plays remaining");
  assertRule(!state.pendingInteraction, "A pending interaction must resolve first");
  return player;
}

function drawOne(state: GameState): Card | undefined {
  if (state.deck.length === 0 && state.discard.length > 0) {
    const reshuffled = shuffleCards(state.discard, state.rngSeed);
    state.deck = reshuffled.cards;
    state.discard = [];
    state.rngSeed = reshuffled.seed;
  }

  return state.deck.shift();
}

function drawCards(state: GameState, player: PlayerState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let index = 0; index < count; index += 1) {
    const card = drawOne(state);
    if (!card) {
      break;
    }

    player.hand.push(card);
    drawn.push(card);
  }

  return drawn;
}

function orphanBrokenBuildings(state: GameState, player: PlayerState, events: GameEvent[]): void {
  if (!state.config.houseRules.orphanBuildingsToBank) {
    return;
  }

  const remainingBuildings: BuildingCard[] = [];

  for (const building of player.buildings) {
    if (isCompleteSet(player, building.color)) {
      remainingBuildings.push(building);
    } else {
      player.bank.push(building.card);
      pushEvent(state, events, {
        type: "system",
        message: `${player.name}'s orphaned ${building.card.name} moved to bank`,
        playerId: player.id,
        cardIds: [building.card.id],
        color: building.color,
      });
    }
  }

  player.buildings = remainingBuildings;
}

function assertGameCanContinue(state: GameState): void {
  assertRule(state.phase !== "game_over", "Game is already over");
}

function completeSetsForWin(player: PlayerState): PropertyColor[] {
  return completeSetColors(player);
}

function checkWinForCurrentPlayer(state: GameState, events: GameEvent[]): void {
  if (state.phase === "game_over") {
    return;
  }

  const player = currentPlayer(state);
  const sets = completeSetsForWin(player);
  if (sets.length >= 3) {
    state.phase = "game_over";
    state.pendingInteraction = undefined;
    state.winnerId = player.id;
    pushEvent(state, events, {
      type: "win",
      message: `${player.name} completed 3 sets and won`,
      playerId: player.id,
    });
  }
}

export function isGameOver(state: GameState): { over: boolean; winnerId?: string } {
  return {
    over: state.phase === "game_over",
    winnerId: state.winnerId,
  };
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.phase = "draw";
  state.playsRemaining = 3;
  state.pendingInteraction = undefined;
  pushEvent(state, events, {
    type: "turn",
    message: `${currentPlayer(state).name}'s turn`,
    playerId: currentPlayer(state).id,
  });
}

function hasJustSayNo(player: PlayerState): boolean {
  return player.hand.some((card) => card.action === "just-say-no");
}

function continueEffects(state: GameState, effects: TargetedEffect[], events: GameEvent[]): void {
  if (state.phase === "game_over") {
    return;
  }

  const [effect, ...remainingEffects] = effects;
  if (!effect) {
    state.pendingInteraction = undefined;
    state.phase = "play";
    checkWinForCurrentPlayer(state, events);
    return;
  }

  const target = findPlayer(state, effect.targetId);
  if (hasJustSayNo(target)) {
    state.phase = "awaiting_response";
    state.pendingInteraction = {
      kind: "just_say_no",
      effect,
      remainingEffects,
      currentResponderId: target.id,
      chain: [],
    };
    pushEvent(state, events, {
      type: "jsn",
      message: `${target.name} may block ${effect.kind}`,
      playerId: target.id,
      targetId: effect.actorId,
    });
    return;
  }

  resolveEffect(state, effect, remainingEffects, events);
}

function finishJsn(state: GameState, pending: Extract<PendingInteraction, { kind: "just_say_no" }>, events: GameEvent[]): void {
  const canceled = pending.chain.length % 2 === 1;

  if (canceled) {
    pushEvent(state, events, {
      type: "jsn",
      message: `${playerLabel(state, pending.effect.targetId)} blocked ${pending.effect.kind}`,
      playerId: pending.effect.targetId,
      targetId: pending.effect.actorId,
    });
    continueEffects(state, pending.remainingEffects, events);
    return;
  }

  pushEvent(state, events, {
    type: "jsn",
    message: `${pending.effect.kind} went through`,
    playerId: pending.effect.actorId,
    targetId: pending.effect.targetId,
  });
  resolveEffect(state, pending.effect, pending.remainingEffects, events);
}

function payableAssets(player: PlayerState): { card: Card; source: "bank" | "property"; assignedColor?: PropertyColor }[] {
  return [
    ...player.bank.map((card) => ({ card, source: "bank" as const })),
    ...player.properties
      .filter((entry) => !entry.card.isMulticolor)
      .map((entry) => ({
        card: entry.card,
        source: "property" as const,
        assignedColor: entry.assignedColor,
      })),
  ];
}

function paymentValue(player: PlayerState, cardIds: string[]): number {
  const assets = payableAssets(player);
  return cardIds.reduce((total, cardId) => {
    const asset = assets.find((candidate) => candidate.card.id === cardId);
    if (!asset) {
      throw new Error(`${player.name} cannot pay with ${cardId}`);
    }
    return total + asset.card.value;
  }, 0);
}

function isValidPayment(player: PlayerState, debt: PaymentRequest, cardIds: string[]): boolean {
  const assets = payableAssets(player);
  if (assets.length === 0) {
    return cardIds.length === 0;
  }

  const uniqueIds = new Set(cardIds);
  if (uniqueIds.size !== cardIds.length) {
    return false;
  }

  const totalAssets = assets.reduce((total, asset) => total + asset.card.value, 0);
  const selectedValue = paymentValue(player, cardIds);

  if (totalAssets < debt.amount) {
    return selectedValue === totalAssets;
  }

  return selectedValue >= debt.amount;
}

export function chooseAutoPayment(player: PlayerState, amount: number): string[] {
  const assets = payableAssets(player).sort((left, right) => left.card.value - right.card.value);
  const total = assets.reduce((sum, asset) => sum + asset.card.value, 0);

  if (assets.length === 0) {
    return [];
  }

  if (total <= amount) {
    return assets.map((asset) => asset.card.id);
  }

  if (assets.length <= 16) {
    let best: { ids: string[]; total: number } | undefined;
    const limit = 1 << assets.length;

    for (let mask = 1; mask < limit; mask += 1) {
      const ids: string[] = [];
      let subsetTotal = 0;

      for (let index = 0; index < assets.length; index += 1) {
        if ((mask & (1 << index)) !== 0) {
          const asset = assets[index];
          if (!asset) {
            continue;
          }
          ids.push(asset.card.id);
          subsetTotal += asset.card.value;
        }
      }

      if (
        subsetTotal >= amount &&
        (!best || subsetTotal < best.total || (subsetTotal === best.total && ids.length < best.ids.length))
      ) {
        best = { ids, total: subsetTotal };
      }
    }

    return best?.ids ?? assets.map((asset) => asset.card.id);
  }

  const selected: string[] = [];
  let runningTotal = 0;
  for (const asset of assets) {
    selected.push(asset.card.id);
    runningTotal += asset.card.value;
    if (runningTotal >= amount) {
      break;
    }
  }

  return selected;
}

function resolvePayment(
  state: GameState,
  debt: PaymentRequest,
  cardIds: string[],
  remainingEffects: TargetedEffect[],
  events: GameEvent[],
): void {
  const debtor = findPlayer(state, debt.debtorId);
  const creditor = findPlayer(state, debt.creditorId);
  assertRule(isValidPayment(debtor, debt, cardIds), "Selected payment does not satisfy the debt");

  const transferredCards: Card[] = [];
  const transferredProperties: TableauCard[] = [];

  for (const cardId of cardIds) {
    const bankCard = removeBankCard(debtor, cardId);
    if (bankCard) {
      creditor.bank.push(bankCard);
      transferredCards.push(bankCard);
      continue;
    }

    const propertyCard = removePropertyCard(debtor, cardId);
    if (!propertyCard) {
      throw new Error(`${debtor.name} cannot pay with ${cardId}`);
    }
    creditor.properties.push(propertyCard);
    transferredProperties.push(propertyCard);
  }

  orphanBrokenBuildings(state, debtor, events);
  orphanBrokenBuildings(state, creditor, events);

  const paid = transferredCards.reduce((sum, card) => sum + card.value, 0) +
    transferredProperties.reduce((sum, entry) => sum + entry.card.value, 0);

  pushEvent(state, events, {
    type: "payment",
    message: `${debtor.name} paid $${paid}M to ${creditor.name}`,
    playerId: debtor.id,
    targetId: creditor.id,
    amount: paid,
    cardIds,
  });

  checkWinForCurrentPlayer(state, events);
  continueEffects(state, remainingEffects, events);
}

function resolveEffect(
  state: GameState,
  effect: TargetedEffect,
  remainingEffects: TargetedEffect[],
  events: GameEvent[],
): void {
  if (effect.kind === "charge") {
    const debtor = findPlayer(state, effect.targetId);
    const creditor = findPlayer(state, effect.actorId);
    const debt: PaymentRequest = {
      debtorId: debtor.id,
      creditorId: creditor.id,
      amount: effect.amount,
      reason: effect.reason,
      color: effect.color,
    };

    if (payableAssets(debtor).length === 0) {
      pushEvent(state, events, {
        type: "payment",
        message: `${debtor.name} had no assets to pay ${creditor.name}`,
        playerId: debtor.id,
        targetId: creditor.id,
        amount: 0,
      });
      continueEffects(state, remainingEffects, events);
      return;
    }

    state.phase = "awaiting_response";
    state.pendingInteraction = {
      kind: "payment",
      debt,
      remainingEffects,
    };
    pushEvent(state, events, {
      type: "rent",
      message: `${debtor.name} owes ${creditor.name} $${effect.amount}M`,
      playerId: creditor.id,
      targetId: debtor.id,
      amount: effect.amount,
      color: effect.color,
    });
    return;
  }

  if (effect.kind === "sly-deal") {
    const actor = findPlayer(state, effect.actorId);
    const target = findPlayer(state, effect.targetId);
    const entry = findPropertyCard(target, effect.targetCardId);
    assertRule(!entry.card.isMulticolor, "Prismatic wild cannot be taken with Sly Deal");
    assertRule(!isCompleteSet(target, entry.assignedColor), "Sly Deal cannot take from a complete set");
    const stolen = removePropertyCard(target, effect.targetCardId);
    if (!stolen) {
      throw new Error("Target property missing");
    }
    const assignedColor = effect.assignedColor ?? stolen.assignedColor;
    assertRule(canAssignCard(stolen.card, assignedColor), "Invalid stolen-card assignment");
    actor.properties.push({ card: stolen.card, assignedColor });
    orphanBrokenBuildings(state, target, events);
    pushEvent(state, events, {
      type: "steal",
      message: `${actor.name} took ${stolen.card.name} from ${target.name}`,
      playerId: actor.id,
      targetId: target.id,
      cardIds: [stolen.card.id],
      color: assignedColor,
    });
    checkWinForCurrentPlayer(state, events);
    continueEffects(state, remainingEffects, events);
    return;
  }

  if (effect.kind === "forced-deal") {
    const actor = findPlayer(state, effect.actorId);
    const target = findPlayer(state, effect.targetId);
    const offered = findPropertyCard(actor, effect.offerCardId);
    const requested = findPropertyCard(target, effect.requestCardId);
    assertRule(!offered.card.isMulticolor && !requested.card.isMulticolor, "Prismatic wild cannot be swapped");
    assertRule(!isCompleteSet(actor, offered.assignedColor), "Forced Deal cannot offer from a complete set");
    assertRule(!isCompleteSet(target, requested.assignedColor), "Forced Deal cannot take from a complete set");

    const removedOffer = removePropertyCard(actor, effect.offerCardId);
    const removedRequest = removePropertyCard(target, effect.requestCardId);
    if (!removedOffer || !removedRequest) {
      throw new Error("Swap cards missing");
    }

    const actorAssignment = effect.requestAssignedColor ?? removedRequest.assignedColor;
    const targetAssignment = effect.offerAssignedColor ?? removedOffer.assignedColor;
    assertRule(canAssignCard(removedRequest.card, actorAssignment), "Invalid requested-card assignment");
    assertRule(canAssignCard(removedOffer.card, targetAssignment), "Invalid offered-card assignment");

    actor.properties.push({ card: removedRequest.card, assignedColor: actorAssignment });
    target.properties.push({ card: removedOffer.card, assignedColor: targetAssignment });
    orphanBrokenBuildings(state, actor, events);
    orphanBrokenBuildings(state, target, events);
    pushEvent(state, events, {
      type: "swap",
      message: `${actor.name} swapped properties with ${target.name}`,
      playerId: actor.id,
      targetId: target.id,
      cardIds: [removedOffer.card.id, removedRequest.card.id],
    });
    checkWinForCurrentPlayer(state, events);
    continueEffects(state, remainingEffects, events);
    return;
  }

  const actor = findPlayer(state, effect.actorId);
  const target = findPlayer(state, effect.targetId);
  assertRule(isCompleteSet(target, effect.color), "Deal Breaker requires a complete target set");
  const movedProperties = target.properties.filter((entry) => entry.assignedColor === effect.color);
  target.properties = target.properties.filter((entry) => entry.assignedColor !== effect.color);
  const movedBuildings = target.buildings.filter((building) => building.color === effect.color);
  target.buildings = target.buildings.filter((building) => building.color !== effect.color);
  actor.properties.push(...movedProperties);
  actor.buildings.push(...movedBuildings);
  pushEvent(state, events, {
    type: "steal",
    message: `${actor.name} swept ${target.name}'s ${effect.color} set`,
    playerId: actor.id,
    targetId: target.id,
    cardIds: [...movedProperties.map((entry) => entry.card.id), ...movedBuildings.map((entry) => entry.card.id)],
    color: effect.color,
  });
  checkWinForCurrentPlayer(state, events);
  continueEffects(state, remainingEffects, events);
}

function startEffects(state: GameState, effects: TargetedEffect[], events: GameEvent[]): void {
  continueEffects(state, effects, events);
}

function playActionToDiscard(player: PlayerState, cardId: string, action: Card["action"], state: GameState): Card {
  const card = findHandAction(player, cardId, action);
  removeHandCard(player, card.id);
  state.discard.push(card);
  return card;
}

function ownedColors(player: PlayerState): PropertyColor[] {
  return PROPERTY_COLORS.filter((color) => propertyCardsFor(player, color).length > 0);
}

function finishMove(state: GameState, events: GameEvent[]): { state: GameState; events: GameEvent[] } {
  state.version += 1;
  state.log = [...state.log, ...events].slice(-120);
  return { state, events };
}

export function applyMove(inputState: GameState, move: Move): { state: GameState; events: GameEvent[] } {
  const state = cloneState(inputState);
  const events: GameEvent[] = [];
  assertGameCanContinue(state);

  if (move.type === "draw") {
    assertRule(state.phase === "draw", "Not in draw phase");
    const player = findPlayer(state, move.playerId);
    assertRule(currentPlayer(state).id === player.id, "It is not this player's turn");
    const count = player.hand.length === 0 ? 5 : 2;
    const drawn = drawCards(state, player, count);
    state.phase = "play";
    state.playsRemaining = 3;
    pushEvent(state, events, {
      type: "draw",
      message: `${player.name} drew ${drawn.length} card${drawn.length === 1 ? "" : "s"}`,
      playerId: player.id,
      cardIds: drawn.map((card) => card.id),
    });
    return finishMove(state, events);
  }

  if (move.type === "respond_jsn") {
    assertRule(state.pendingInteraction?.kind === "just_say_no", "No Just Say No prompt is pending");
    const pending = state.pendingInteraction;
    assertRule(pending.currentResponderId === move.playerId, "This player is not responding");
    const responder = findPlayer(state, move.playerId);

    if (!move.useCardId) {
      finishJsn(state, pending, events);
      return finishMove(state, events);
    }

    const card = findHandAction(responder, move.useCardId, "just-say-no");
    removeHandCard(responder, card.id);
    state.discard.push(card);
    const chain = [...pending.chain, responder.id];
    const nextResponderId = responder.id === pending.effect.targetId ? pending.effect.actorId : pending.effect.targetId;
    const nextResponder = findPlayer(state, nextResponderId);
    pushEvent(state, events, {
      type: "jsn",
      message: `${responder.name} played Hard No`,
      playerId: responder.id,
      targetId: nextResponder.id,
      cardIds: [card.id],
    });

    if (!hasJustSayNo(nextResponder)) {
      finishJsn(state, { ...pending, chain }, events);
      return finishMove(state, events);
    }

    state.pendingInteraction = {
      ...pending,
      chain,
      currentResponderId: nextResponder.id,
    };
    state.phase = "awaiting_response";
    return finishMove(state, events);
  }

  if (move.type === "pay") {
    assertRule(state.pendingInteraction?.kind === "payment", "No payment is pending");
    const pending = state.pendingInteraction;
    assertRule(pending.debt.debtorId === move.playerId, "This player does not owe the pending payment");
    resolvePayment(state, pending.debt, move.cardIds, pending.remainingEffects, events);
    return finishMove(state, events);
  }

  if (move.type === "play_to_bank") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = player.hand.find((candidate) => candidate.id === move.cardId);
    if (!card) {
      throw new Error("Card is not in hand");
    }
    assertRule(canBankCard(card), "This card cannot be banked");
    removeHandCard(player, card.id);
    player.bank.push(card);
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "bank",
      message: `${player.name} banked ${card.name}`,
      playerId: player.id,
      cardIds: [card.id],
      amount: card.value,
    });
    return finishMove(state, events);
  }

  if (move.type === "play_property") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = player.hand.find((candidate) => candidate.id === move.cardId);
    if (!card) {
      throw new Error("Card is not in hand");
    }
    assertRule(isPropertyLike(card), "Only property cards can be played as property");
    assertRule(canAssignCard(card, move.assignedColor), "Card cannot be assigned to that color");
    removeHandCard(player, card.id);
    player.properties.push({ card, assignedColor: move.assignedColor });
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "property",
      message: `${player.name} played ${card.name} to ${move.assignedColor}`,
      playerId: player.id,
      cardIds: [card.id],
      color: move.assignedColor,
    });
    checkWinForCurrentPlayer(state, events);
    return finishMove(state, events);
  }

  if (move.type === "reassign_wild") {
    const player = assertCurrentPlayable(state, move.playerId, 0);
    const entry = findPropertyCard(player, move.cardId);
    assertRule(entry.card.kind === "wild", "Only wildcards can be reassigned");
    assertRule(canAssignCard(entry.card, move.assignedColor), "Invalid wildcard assignment");
    entry.assignedColor = move.assignedColor;
    orphanBrokenBuildings(state, player, events);
    pushEvent(state, events, {
      type: "property",
      message: `${player.name} reassigned ${entry.card.name} to ${move.assignedColor}`,
      playerId: player.id,
      cardIds: [entry.card.id],
      color: move.assignedColor,
    });
    checkWinForCurrentPlayer(state, events);
    return finishMove(state, events);
  }

  if (move.type === "play_pass_go") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "pass-go", state);
    const drawn = drawCards(state, player, 2);
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} played ${card.name} and drew ${drawn.length}`,
      playerId: player.id,
      cardIds: [card.id, ...drawn.map((drawnCard) => drawnCard.id)],
    });
    return finishMove(state, events);
  }

  if (move.type === "play_house") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = findHandAction(player, move.cardId, "house");
    assertRule(move.color !== "railroad" && move.color !== "utility", "Buildings cannot be placed on Railroad or Utility");
    assertRule(isCompleteSet(player, move.color), "House requires a complete set");
    assertRule(!hasHouse(player, move.color), "A set can only have one house");
    removeHandCard(player, card.id);
    player.buildings.push({ card, color: move.color });
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "property",
      message: `${player.name} added a House to ${move.color}`,
      playerId: player.id,
      cardIds: [card.id],
      color: move.color,
    });
    return finishMove(state, events);
  }

  if (move.type === "play_hotel") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = findHandAction(player, move.cardId, "hotel");
    assertRule(move.color !== "railroad" && move.color !== "utility", "Buildings cannot be placed on Railroad or Utility");
    assertRule(isCompleteSet(player, move.color), "Hotel requires a complete set");
    assertRule(hasHouse(player, move.color), "Hotel requires a house first");
    assertRule(!hasHotel(player, move.color), "A set can only have one hotel");
    removeHandCard(player, card.id);
    player.buildings.push({ card, color: move.color });
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "property",
      message: `${player.name} added a Hotel to ${move.color}`,
      playerId: player.id,
      cardIds: [card.id],
      color: move.color,
    });
    return finishMove(state, events);
  }

  if (move.type === "play_rent") {
    const requiredPlays = move.doubleRentCardId ? 2 : 1;
    const player = assertCurrentPlayable(state, move.playerId, requiredPlays);
    const rentCard = player.hand.find((candidate) => candidate.id === move.cardId);
    if (!rentCard) {
      throw new Error("Rent card is not in hand");
    }
    assertRule(rentCard.kind === "rent", "Expected a rent card");
    assertRule(Boolean(rentCard.rentColors?.includes(move.color)), "Rent card cannot charge that color");
    assertRule(ownedColors(player).includes(move.color), "You must own that color to charge rent");
    const baseRent = rentForColor(player, move.color);
    assertRule(baseRent > 0, "No rent is available for that color");

    removeHandCard(player, rentCard.id);
    state.discard.push(rentCard);

    const discardedCardIds = [rentCard.id];
    if (move.doubleRentCardId) {
      const doubleCard = playActionToDiscard(player, move.doubleRentCardId, "double-rent", state);
      discardedCardIds.push(doubleCard.id);
    }

    const amount = baseRent * (move.doubleRentCardId ? 2 : 1);
    state.playsRemaining -= requiredPlays;
    const targets = rentCard.wildRent
      ? [findPlayer(state, move.targetId ?? "")]
      : otherPlayers(state, player.id);

    assertRule(targets.length > 0, "Rent requires a target");
    const effects: ChargeEffect[] = targets.map((target) => ({
      kind: "charge",
      actorId: player.id,
      targetId: target.id,
      amount,
      reason: "rent",
      color: move.color,
      doubled: Boolean(move.doubleRentCardId),
    }));
    pushEvent(state, events, {
      type: "rent",
      message: `${player.name} charged $${amount}M ${move.color} rent`,
      playerId: player.id,
      cardIds: discardedCardIds,
      amount,
      color: move.color,
    });
    startEffects(state, effects, events);
    return finishMove(state, events);
  }

  if (move.type === "play_debt_collector") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "debt-collector", state);
    const target = findPlayer(state, move.targetId);
    assertRule(target.id !== player.id, "Debt Collector must target another player");
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} collected a $5M debt from ${target.name}`,
      playerId: player.id,
      targetId: target.id,
      cardIds: [card.id],
      amount: 5,
    });
    startEffects(
      state,
      [{ kind: "charge", actorId: player.id, targetId: target.id, amount: 5, reason: "debt-collector" }],
      events,
    );
    return finishMove(state, events);
  }

  if (move.type === "play_birthday") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "birthday", state);
    state.playsRemaining -= 1;
    const effects: ChargeEffect[] = otherPlayers(state, player.id).map((target) => ({
      kind: "charge",
      actorId: player.id,
      targetId: target.id,
      amount: 2,
      reason: "birthday",
    }));
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} charged everyone $2M`,
      playerId: player.id,
      cardIds: [card.id],
      amount: 2,
    });
    startEffects(state, effects, events);
    return finishMove(state, events);
  }

  if (move.type === "play_sly_deal") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "sly-deal", state);
    const target = findPlayer(state, move.targetId);
    assertRule(target.id !== player.id, "Sly Deal must target another player");
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} played ${card.name} on ${target.name}`,
      playerId: player.id,
      targetId: target.id,
      cardIds: [card.id],
    });
    startEffects(
      state,
      [
        {
          kind: "sly-deal",
          actorId: player.id,
          targetId: target.id,
          targetCardId: move.targetCardId,
          assignedColor: move.assignedColor,
        },
      ],
      events,
    );
    return finishMove(state, events);
  }

  if (move.type === "play_forced_deal") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "forced-deal", state);
    const target = findPlayer(state, move.targetId);
    assertRule(target.id !== player.id, "Forced Deal must target another player");
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} forced a swap with ${target.name}`,
      playerId: player.id,
      targetId: target.id,
      cardIds: [card.id],
    });
    startEffects(
      state,
      [
        {
          kind: "forced-deal",
          actorId: player.id,
          targetId: target.id,
          offerCardId: move.offerCardId,
          requestCardId: move.requestCardId,
          offerAssignedColor: move.offerAssignedColor,
          requestAssignedColor: move.requestAssignedColor,
        },
      ],
      events,
    );
    return finishMove(state, events);
  }

  if (move.type === "play_deal_breaker") {
    const player = assertCurrentPlayable(state, move.playerId);
    const card = playActionToDiscard(player, move.cardId, "deal-breaker", state);
    const target = findPlayer(state, move.targetId);
    assertRule(target.id !== player.id, "Deal Breaker must target another player");
    state.playsRemaining -= 1;
    pushEvent(state, events, {
      type: "play",
      message: `${player.name} targeted ${target.name}'s ${move.color} set`,
      playerId: player.id,
      targetId: target.id,
      cardIds: [card.id],
      color: move.color,
    });
    startEffects(
      state,
      [{ kind: "deal-breaker", actorId: player.id, targetId: target.id, color: move.color }],
      events,
    );
    return finishMove(state, events);
  }

  if (move.type === "end_turn") {
    const player = assertCurrentPlayable(state, move.playerId, 0);
    if (player.hand.length > 7) {
      state.phase = "discard";
      pushEvent(state, events, {
        type: "discard",
        message: `${player.name} must discard to 7 cards`,
        playerId: player.id,
      });
    } else {
      advanceTurn(state, events);
    }

    return finishMove(state, events);
  }

  if (move.type === "discard") {
    assertRule(state.phase === "discard", "Not in discard phase");
    const player = findPlayer(state, move.playerId);
    assertRule(currentPlayer(state).id === player.id, "Only the active player can discard");
    const uniqueIds = new Set(move.cardIds);
    assertRule(uniqueIds.size === move.cardIds.length, "Duplicate discard card");
    for (const cardId of move.cardIds) {
      const card = removeHandCard(player, cardId);
      state.discard.push(card);
    }
    assertRule(player.hand.length <= 7, "Must discard down to 7 cards");
    pushEvent(state, events, {
      type: "discard",
      message: `${player.name} discarded ${move.cardIds.length} card${move.cardIds.length === 1 ? "" : "s"}`,
      playerId: player.id,
      cardIds: move.cardIds,
    });
    advanceTurn(state, events);
    return finishMove(state, events);
  }

  const exhaustive: never = move;
  throw new Error(`Unsupported move ${(exhaustive as Move).type}`);
}

function legalPropertyMoves(player: PlayerState): Move[] {
  return player.hand.flatMap((card) => {
    if (!isPropertyLike(card)) {
      return [];
    }

    return assignableColors(card).map((assignedColor) => ({
      type: "play_property" as const,
      playerId: player.id,
      cardId: card.id,
      assignedColor,
    }));
  });
}

function legalActionMoves(state: GameState, player: PlayerState): Move[] {
  const moves: Move[] = [];
  const opponents = otherPlayers(state, player.id);
  const colorsOwned = ownedColors(player);

  for (const card of player.hand) {
    if (canBankCard(card)) {
      moves.push({ type: "play_to_bank", playerId: player.id, cardId: card.id });
    }

    if (card.action === "pass-go") {
      moves.push({ type: "play_pass_go", playerId: player.id, cardId: card.id });
    }

    if (card.action === "house") {
      for (const color of completeSetColors(player)) {
        if (color !== "railroad" && color !== "utility" && !hasHouse(player, color)) {
          moves.push({ type: "play_house", playerId: player.id, cardId: card.id, color });
        }
      }
    }

    if (card.action === "hotel") {
      for (const color of completeSetColors(player)) {
        if (color !== "railroad" && color !== "utility" && hasHouse(player, color) && !hasHotel(player, color)) {
          moves.push({ type: "play_hotel", playerId: player.id, cardId: card.id, color });
        }
      }
    }

    if (card.kind === "rent") {
      const doubleRent = player.hand.find((candidate) => candidate.action === "double-rent");
      for (const color of colorsOwned) {
        if (!card.rentColors?.includes(color)) {
          continue;
        }

        if (card.wildRent) {
          for (const opponent of opponents) {
            moves.push({ type: "play_rent", playerId: player.id, cardId: card.id, color, targetId: opponent.id });
            if (doubleRent && state.playsRemaining >= 2) {
              moves.push({
                type: "play_rent",
                playerId: player.id,
                cardId: card.id,
                color,
                targetId: opponent.id,
                doubleRentCardId: doubleRent.id,
              });
            }
          }
        } else {
          moves.push({ type: "play_rent", playerId: player.id, cardId: card.id, color });
          if (doubleRent && state.playsRemaining >= 2) {
            moves.push({
              type: "play_rent",
              playerId: player.id,
              cardId: card.id,
              color,
              doubleRentCardId: doubleRent.id,
            });
          }
        }
      }
    }

    if (card.action === "debt-collector") {
      for (const opponent of opponents) {
        moves.push({ type: "play_debt_collector", playerId: player.id, cardId: card.id, targetId: opponent.id });
      }
    }

    if (card.action === "birthday") {
      moves.push({ type: "play_birthday", playerId: player.id, cardId: card.id });
    }

    if (card.action === "sly-deal") {
      for (const opponent of opponents) {
        for (const targetProperty of opponent.properties) {
          if (!targetProperty.card.isMulticolor && !isCompleteSet(opponent, targetProperty.assignedColor)) {
            moves.push({
              type: "play_sly_deal",
              playerId: player.id,
              cardId: card.id,
              targetId: opponent.id,
              targetCardId: targetProperty.card.id,
              assignedColor: targetProperty.assignedColor,
            });
          }
        }
      }
    }

    if (card.action === "forced-deal") {
      const ownEligible = player.properties.filter(
        (entry) => !entry.card.isMulticolor && !isCompleteSet(player, entry.assignedColor),
      );
      for (const opponent of opponents) {
        const targetEligible = opponent.properties.filter(
          (entry) => !entry.card.isMulticolor && !isCompleteSet(opponent, entry.assignedColor),
        );
        for (const offer of ownEligible) {
          for (const request of targetEligible) {
            moves.push({
              type: "play_forced_deal",
              playerId: player.id,
              cardId: card.id,
              targetId: opponent.id,
              offerCardId: offer.card.id,
              requestCardId: request.card.id,
              offerAssignedColor: offer.assignedColor,
              requestAssignedColor: request.assignedColor,
            });
          }
        }
      }
    }

    if (card.action === "deal-breaker") {
      for (const opponent of opponents) {
        for (const color of completeSetColors(opponent)) {
          moves.push({ type: "play_deal_breaker", playerId: player.id, cardId: card.id, targetId: opponent.id, color });
        }
      }
    }
  }

  return moves;
}

function legalReassignMoves(player: PlayerState): Move[] {
  return player.properties.flatMap((entry) => {
    if (entry.card.kind !== "wild") {
      return [];
    }

    return assignableColors(entry.card)
      .filter((color) => color !== entry.assignedColor)
      .map((assignedColor) => ({
        type: "reassign_wild" as const,
        playerId: player.id,
        cardId: entry.card.id,
        assignedColor,
      }));
  });
}

export function getLegalMoves(state: GameState, playerId: string): Move[] {
  if (state.phase === "game_over") {
    return [];
  }

  if (state.pendingInteraction?.kind === "just_say_no") {
    const pending = state.pendingInteraction;
    if (pending.currentResponderId !== playerId) {
      return [];
    }

    const player = findPlayer(state, playerId);
    return [
      { type: "respond_jsn", playerId },
      ...player.hand
        .filter((card) => card.action === "just-say-no")
        .map((card) => ({ type: "respond_jsn" as const, playerId, useCardId: card.id })),
    ];
  }

  if (state.pendingInteraction?.kind === "payment") {
    const pending = state.pendingInteraction;
    if (pending.debt.debtorId !== playerId) {
      return [];
    }

    const player = findPlayer(state, playerId);
    return [{ type: "pay", playerId, cardIds: chooseAutoPayment(player, pending.debt.amount) }];
  }

  if (state.phase === "draw") {
    return currentPlayer(state).id === playerId ? [{ type: "draw", playerId }] : [];
  }

  if (state.phase === "discard") {
    const player = currentPlayer(state);
    if (player.id !== playerId) {
      return [];
    }
    return [
      {
        type: "discard",
        playerId,
        cardIds: player.hand.slice(7).map((card) => card.id),
      },
    ];
  }

  if (state.phase !== "play" || currentPlayer(state).id !== playerId) {
    return [];
  }

  const player = findPlayer(state, playerId);
  const playableMoves = state.playsRemaining > 0 ? [...legalPropertyMoves(player), ...legalActionMoves(state, player)] : [];
  return [...playableMoves, ...legalReassignMoves(player), { type: "end_turn", playerId }];
}

export function isMoveLegal(state: GameState, move: Move): boolean {
  try {
    applyMove(state, move);
    return true;
  } catch {
    return false;
  }
}

export function redactStateFor(state: GameState, playerId: string): RedactedState {
  const pending = state.pendingInteraction
    ? cloneState(state.pendingInteraction)
    : undefined;

  if (pending?.kind === "payment" && pending.debt.debtorId !== playerId && pending.debt.creditorId !== playerId) {
    pending.debt = {
      ...pending.debt,
      amount: pending.debt.amount,
    };
  }

  return {
    id: state.id,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      isBot: player.isBot,
      connected: player.connected,
      hand: player.id === playerId ? cloneState(player.hand) : undefined,
      bank: player.id === playerId ? cloneState(player.bank) : undefined,
      handCount: player.hand.length,
      bankTotal: bankTotal(player),
      bankCount: player.bank.length,
      properties: cloneState(player.properties),
      buildings: cloneState(player.buildings),
      completeSets: completeSetColors(player),
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.at(-1),
    currentPlayerId: currentPlayer(state).id,
    phase: state.phase,
    turnNumber: state.turnNumber,
    playsRemaining: state.playsRemaining,
    pendingInteraction: pending,
    log: cloneState(state.log),
    version: state.version,
    winnerId: state.winnerId,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(serialized: string): GameState {
  return JSON.parse(serialized) as GameState;
}

export function cardColorValue(color: PropertyColor): number {
  return PROPERTY_FACE_VALUE[color];
}
