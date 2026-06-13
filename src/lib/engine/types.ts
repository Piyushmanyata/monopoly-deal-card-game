export const PROPERTY_COLORS = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
  "railroad",
  "utility",
] as const;

export type PropertyColor = (typeof PROPERTY_COLORS)[number];

export type CardKind = "property" | "wild" | "money" | "action" | "rent";

export type ActionType =
  | "deal-breaker"
  | "just-say-no"
  | "sly-deal"
  | "forced-deal"
  | "debt-collector"
  | "birthday"
  | "pass-go"
  | "house"
  | "hotel"
  | "double-rent";

export type Card = {
  id: string;
  defId: string;
  kind: CardKind;
  name: string;
  value: number;
  colors?: PropertyColor[];
  action?: ActionType;
  rentColors?: PropertyColor[];
  wildRent?: boolean;
  isMulticolor?: boolean;
};

export type PublicPlayer = {
  id: string;
  name: string;
  avatar: string;
  isBot?: boolean;
};

export type TableauCard = {
  card: Card;
  assignedColor: PropertyColor;
};

export type BuildingCard = {
  card: Card;
  color: PropertyColor;
};

export type PlayerState = PublicPlayer & {
  hand: Card[];
  bank: Card[];
  properties: TableauCard[];
  buildings: BuildingCard[];
  connected?: boolean;
};

export type GameConfig = {
  seed?: number;
  players?: PublicPlayer[];
  playerCount?: number;
  botCount?: number;
  houseRules?: {
    orphanBuildingsToBank?: boolean;
  };
};

export type Phase = "draw" | "play" | "discard" | "awaiting_response" | "game_over";

export type GameEvent = {
  id: string;
  type:
    | "draw"
    | "play"
    | "bank"
    | "property"
    | "rent"
    | "payment"
    | "steal"
    | "swap"
    | "jsn"
    | "discard"
    | "turn"
    | "win"
    | "system";
  message: string;
  playerId?: string;
  targetId?: string;
  cardIds?: string[];
  amount?: number;
  color?: PropertyColor;
};

export type ChargeReason = "rent" | "debt-collector" | "birthday";

export type ChargeEffect = {
  kind: "charge";
  actorId: string;
  targetId: string;
  amount: number;
  reason: ChargeReason;
  color?: PropertyColor;
  doubled?: boolean;
};

export type SlyDealEffect = {
  kind: "sly-deal";
  actorId: string;
  targetId: string;
  targetCardId: string;
  assignedColor?: PropertyColor;
};

export type ForcedDealEffect = {
  kind: "forced-deal";
  actorId: string;
  targetId: string;
  offerCardId: string;
  requestCardId: string;
  offerAssignedColor?: PropertyColor;
  requestAssignedColor?: PropertyColor;
};

export type DealBreakerEffect = {
  kind: "deal-breaker";
  actorId: string;
  targetId: string;
  color: PropertyColor;
};

export type TargetedEffect =
  | ChargeEffect
  | SlyDealEffect
  | ForcedDealEffect
  | DealBreakerEffect;

export type PaymentRequest = {
  debtorId: string;
  creditorId: string;
  amount: number;
  reason: ChargeReason;
  color?: PropertyColor;
};

export type PendingInteraction =
  | {
      kind: "just_say_no";
      effect: TargetedEffect;
      remainingEffects: TargetedEffect[];
      currentResponderId: string;
      chain: string[];
    }
  | {
      kind: "payment";
      debt: PaymentRequest;
      remainingEffects: TargetedEffect[];
    };

export type GameState = {
  id: string;
  config: Required<Pick<GameConfig, "houseRules">>;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  currentPlayerIndex: number;
  phase: Phase;
  turnNumber: number;
  playsRemaining: number;
  pendingInteraction?: PendingInteraction;
  log: GameEvent[];
  version: number;
  rngSeed: number;
  winnerId?: string;
};

export type DrawMove = {
  type: "draw";
  playerId: string;
};

export type PlayToBankMove = {
  type: "play_to_bank";
  playerId: string;
  cardId: string;
};

export type PlayPropertyMove = {
  type: "play_property";
  playerId: string;
  cardId: string;
  assignedColor: PropertyColor;
};

export type ReassignWildMove = {
  type: "reassign_wild";
  playerId: string;
  cardId: string;
  assignedColor: PropertyColor;
};

export type PlayPassGoMove = {
  type: "play_pass_go";
  playerId: string;
  cardId: string;
};

export type PlayHouseMove = {
  type: "play_house";
  playerId: string;
  cardId: string;
  color: PropertyColor;
};

export type PlayHotelMove = {
  type: "play_hotel";
  playerId: string;
  cardId: string;
  color: PropertyColor;
};

export type PlayRentMove = {
  type: "play_rent";
  playerId: string;
  cardId: string;
  color: PropertyColor;
  targetId?: string;
  doubleRentCardId?: string;
};

export type PlayDebtCollectorMove = {
  type: "play_debt_collector";
  playerId: string;
  cardId: string;
  targetId: string;
};

export type PlayBirthdayMove = {
  type: "play_birthday";
  playerId: string;
  cardId: string;
};

export type PlaySlyDealMove = {
  type: "play_sly_deal";
  playerId: string;
  cardId: string;
  targetId: string;
  targetCardId: string;
  assignedColor?: PropertyColor;
};

export type PlayForcedDealMove = {
  type: "play_forced_deal";
  playerId: string;
  cardId: string;
  targetId: string;
  offerCardId: string;
  requestCardId: string;
  offerAssignedColor?: PropertyColor;
  requestAssignedColor?: PropertyColor;
};

export type PlayDealBreakerMove = {
  type: "play_deal_breaker";
  playerId: string;
  cardId: string;
  targetId: string;
  color: PropertyColor;
};

export type RespondJsnMove = {
  type: "respond_jsn";
  playerId: string;
  useCardId?: string;
};

export type PayMove = {
  type: "pay";
  playerId: string;
  cardIds: string[];
};

export type EndTurnMove = {
  type: "end_turn";
  playerId: string;
};

export type DiscardMove = {
  type: "discard";
  playerId: string;
  cardIds: string[];
};

export type Move =
  | DrawMove
  | PlayToBankMove
  | PlayPropertyMove
  | ReassignWildMove
  | PlayPassGoMove
  | PlayHouseMove
  | PlayHotelMove
  | PlayRentMove
  | PlayDebtCollectorMove
  | PlayBirthdayMove
  | PlaySlyDealMove
  | PlayForcedDealMove
  | PlayDealBreakerMove
  | RespondJsnMove
  | PayMove
  | EndTurnMove
  | DiscardMove;

export type PublicTableau = {
  bankTotal: number;
  bankCount: number;
  properties: TableauCard[];
  buildings: BuildingCard[];
  completeSets: PropertyColor[];
};

export type RedactedPlayerState = PublicPlayer & {
  hand?: Card[];
  bank?: Card[];
  handCount: number;
  bankTotal: number;
  bankCount: number;
  properties: TableauCard[];
  buildings: BuildingCard[];
  completeSets: PropertyColor[];
  connected?: boolean;
};

export type RedactedState = {
  id: string;
  players: RedactedPlayerState[];
  deckCount: number;
  discardTop?: Card;
  currentPlayerId: string;
  phase: Phase;
  turnNumber: number;
  playsRemaining: number;
  pendingInteraction?: PendingInteraction;
  log: GameEvent[];
  version: number;
  winnerId?: string;
};
