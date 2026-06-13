import { describe, expect, it } from "vitest";
import {
  applyMove,
  bankTotal,
  chooseAutoPayment,
  completeSetColors,
  createOrderedDeck,
  getDeckCount,
  isCompleteSet,
  isMoveLegal,
  rentForColor,
  type Card,
  type GameState,
  type PlayerState,
  type PropertyColor,
  type TableauCard,
} from "../index";

const orderedDeck = createOrderedDeck();

function card(defId: string, copy = 0): Card {
  const found = orderedDeck.filter((candidate) => candidate.defId === defId)[copy];
  if (!found) {
    throw new Error(`Missing card ${defId} copy ${copy}`);
  }

  return JSON.parse(JSON.stringify(found)) as Card;
}

function property(defId: string, color: PropertyColor, copy = 0): TableauCard {
  return { card: card(defId, copy), assignedColor: color };
}

function player(
  id: string,
  hand: Card[] = [],
  bank: Card[] = [],
  properties: TableauCard[] = [],
  buildings: PlayerState["buildings"] = [],
): PlayerState {
  return {
    id,
    name: id.toUpperCase(),
    avatar: id[0].toUpperCase(),
    isBot: false,
    connected: true,
    hand,
    bank,
    properties,
    buildings,
  };
}

function baseState(players: PlayerState[], phase: GameState["phase"] = "play", currentPlayerIndex = 0): GameState {
  return {
    id: "test-game",
    config: { houseRules: { orphanBuildingsToBank: true } },
    players,
    deck: [],
    discard: [],
    currentPlayerIndex,
    phase,
    turnNumber: 1,
    playsRemaining: 3,
    log: [],
    version: 0,
    rngSeed: 42,
  };
}

describe("deck", () => {
  it("contains the 106 playable cards from the spec", () => {
    expect(getDeckCount()).toBe(106);
  });
});

describe("turn flow", () => {
  it("draws 5 at turn start when the player has no cards", () => {
    const state = baseState([player("a"), player("b")], "draw");
    state.deck = [
      card("money-1", 0),
      card("money-1", 1),
      card("money-1", 2),
      card("money-1", 3),
      card("money-1", 4),
    ];

    const result = applyMove(state, { type: "draw", playerId: "a" }).state;

    expect(result.players[0].hand).toHaveLength(5);
    expect(result.phase).toBe("play");
  });

  it("reshuffles discard when the draw pile runs out", () => {
    const state = baseState([player("a", [card("money-1", 0)]), player("b")], "draw");
    state.deck = [card("money-2", 0)];
    state.discard = [card("money-3", 0), card("money-4", 0)];

    const result = applyMove(state, { type: "draw", playerId: "a" }).state;

    expect(result.players[0].hand).toHaveLength(3);
    expect(result.discard).toHaveLength(0);
    expect(result.deck).toHaveLength(1);
  });

  it("enforces the hand limit only at end turn", () => {
    const passGo = card("action-pass-go", 0);
    const state = baseState([
      player("a", [
        passGo,
        card("money-1", 0),
        card("money-1", 1),
        card("money-1", 2),
        card("money-1", 3),
        card("money-1", 4),
        card("money-1", 5),
      ]),
      player("b"),
    ]);
    state.deck = [card("money-2", 0), card("money-2", 1)];

    const afterPassGo = applyMove(state, { type: "play_pass_go", playerId: "a", cardId: passGo.id }).state;
    expect(afterPassGo.players[0].hand).toHaveLength(8);
    expect(afterPassGo.phase).toBe("play");

    const afterEnd = applyMove(afterPassGo, { type: "end_turn", playerId: "a" }).state;
    expect(afterEnd.phase).toBe("discard");
  });
});

describe("payments", () => {
  it("gives no change on overpayment", () => {
    const debt = card("action-debt-collector", 0);
    const ten = card("money-10", 0);
    let state = baseState([player("a", [debt]), player("b", [], [ten])]);

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debt.id,
      targetId: "b",
    }).state;
    state = applyMove(state, { type: "pay", playerId: "b", cardIds: [ten.id] }).state;

    expect(bankTotal(state.players[0])).toBe(10);
    expect(bankTotal(state.players[1])).toBe(0);
  });

  it("requires pay-all when short and allows assetless players to pay nothing", () => {
    const debt = card("action-debt-collector", 0);
    const one = card("money-1", 0);
    const brown = property("property-brown", "brown", 0);
    let state = baseState([player("a", [debt]), player("b", [], [one], [brown])]);

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debt.id,
      targetId: "b",
    }).state;

    expect(() => applyMove(state, { type: "pay", playerId: "b", cardIds: [one.id] })).toThrow();
    state = applyMove(state, { type: "pay", playerId: "b", cardIds: [one.id, brown.card.id] }).state;
    expect(bankTotal(state.players[0])).toBe(1);
    expect(state.players[0].properties).toHaveLength(1);

    const debtTwo = card("action-debt-collector", 1);
    state.players[0].hand.push(debtTwo);
    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debtTwo.id,
      targetId: "b",
    }).state;
    expect(state.pendingInteraction).toBeUndefined();
    expect(state.phase).toBe("play");
  });

  it("keeps prismatic wildcards out of banking and payment", () => {
    const wild = card("wild-any", 0);
    const debt = card("action-debt-collector", 0);
    let state = baseState([player("a", [wild, debt]), player("b", [], [], [property("wild-any", "red", 1)])]);

    expect(() => applyMove(state, { type: "play_to_bank", playerId: "a", cardId: wild.id })).toThrow();

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debt.id,
      targetId: "b",
    }).state;

    expect(state.pendingInteraction).toBeUndefined();
    expect(state.players[1].properties).toHaveLength(1);
  });

  it("auto-payment chooses the smallest legal overpayment", () => {
    const debtor = player("b", [], [card("money-1", 0), card("money-4", 0), card("money-10", 0)]);
    expect(chooseAutoPayment(debtor, 5).sort()).toEqual([card("money-1", 0).id, card("money-4", 0).id].sort());
  });
});

describe("Just Say No", () => {
  it("cancels with odd chains and proceeds with even chains", () => {
    const debt = card("action-debt-collector", 0);
    const jsnB = card("action-just-say-no", 0);
    let state = baseState([player("a", [debt]), player("b", [jsnB], [card("money-5", 0)])]);

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debt.id,
      targetId: "b",
    }).state;
    state = applyMove(state, { type: "respond_jsn", playerId: "b", useCardId: jsnB.id }).state;
    expect(state.pendingInteraction).toBeUndefined();
    expect(bankTotal(state.players[0])).toBe(0);

    const debtTwo = card("action-debt-collector", 1);
    const jsnBTwo = card("action-just-say-no", 1);
    const jsnA = card("action-just-say-no", 2);
    state = baseState([player("a", [debtTwo, jsnA]), player("b", [jsnBTwo], [card("money-5", 0)])]);

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "a",
      cardId: debtTwo.id,
      targetId: "b",
    }).state;
    state = applyMove(state, { type: "respond_jsn", playerId: "b", useCardId: jsnBTwo.id }).state;
    state = applyMove(state, { type: "respond_jsn", playerId: "a", useCardId: jsnA.id }).state;
    expect(state.pendingInteraction?.kind).toBe("payment");
  });
});

describe("rent", () => {
  it("normal rent hits all opponents and wild rent targets one", () => {
    const rent = card("rent-red-yellow", 0);
    const wildRent = card("rent-wild", 0);
    const doubleRent = card("action-double-rent", 0);
    let state = baseState([
      player("a", [rent, wildRent, doubleRent], [], [property("property-red", "red", 0)]),
      player("b", [], [card("money-5", 0)]),
      player("c", [], [card("money-5", 1)]),
    ]);

    state = applyMove(state, {
      type: "play_rent",
      playerId: "a",
      cardId: rent.id,
      color: "red",
      doubleRentCardId: doubleRent.id,
    }).state;
    expect(state.playsRemaining).toBe(1);
    expect(state.pendingInteraction?.kind).toBe("payment");
    expect(state.pendingInteraction?.kind === "payment" ? state.pendingInteraction.debt.debtorId : "").toBe("b");
    state = applyMove(state, { type: "pay", playerId: "b", cardIds: [card("money-5", 0).id] }).state;
    expect(state.pendingInteraction?.kind === "payment" ? state.pendingInteraction.debt.debtorId : "").toBe("c");
    state = applyMove(state, { type: "pay", playerId: "c", cardIds: [card("money-5", 1).id] }).state;

    state.players[0].hand.push(wildRent);
    state.players[1].bank.push(card("money-2", 0));
    state.playsRemaining = 1;
    state = applyMove(state, {
      type: "play_rent",
      playerId: "a",
      cardId: wildRent.id,
      color: "red",
      targetId: "b",
    }).state;
    expect(state.pendingInteraction?.kind === "payment" ? state.pendingInteraction.debt.debtorId : "").toBe("b");
  });
});

describe("property actions and buildings", () => {
  it("blocks Sly Deal and Forced Deal from complete sets and prismatic wilds", () => {
    const sly = card("action-sly-deal", 0);
    const forced = card("action-forced-deal", 0);
    const state = baseState([
      player("a", [sly, forced], [], [property("property-orange", "orange", 0)]),
      player("b", [], [], [property("property-brown", "brown", 0), property("property-brown", "brown", 1)]),
    ]);

    expect(
      isMoveLegal(state, {
        type: "play_sly_deal",
        playerId: "a",
        cardId: sly.id,
        targetId: "b",
        targetCardId: state.players[1].properties[0].card.id,
      }),
    ).toBe(false);
    expect(
      isMoveLegal(state, {
        type: "play_forced_deal",
        playerId: "a",
        cardId: forced.id,
        targetId: "b",
        offerCardId: state.players[0].properties[0].card.id,
        requestCardId: state.players[1].properties[0].card.id,
      }),
    ).toBe(false);
  });

  it("Deal Breaker takes a whole complete set with buildings", () => {
    const dealBreaker = card("action-deal-breaker", 0);
    const house = card("action-house", 0);
    const hotel = card("action-hotel", 0);
    const state = baseState([
      player("a", [dealBreaker]),
      player(
        "b",
        [],
        [],
        [property("property-brown", "brown", 0), property("property-brown", "brown", 1)],
        [
          { card: house, color: "brown" },
          { card: hotel, color: "brown" },
        ],
      ),
    ]);

    const result = applyMove(state, {
      type: "play_deal_breaker",
      playerId: "a",
      cardId: dealBreaker.id,
      targetId: "b",
      color: "brown",
    }).state;

    expect(result.players[0].properties).toHaveLength(2);
    expect(result.players[0].buildings).toHaveLength(2);
    expect(result.players[1].properties).toHaveLength(0);
  });

  it("enforces house/hotel order and moves orphaned buildings to bank", () => {
    const hotel = card("action-hotel", 0);
    const house = card("action-house", 0);
    const redSet = [
      property("property-red", "red", 0),
      property("property-red", "red", 1),
      property("property-red", "red", 2),
    ];
    const withoutHouse = baseState([player("a", [hotel], [], redSet), player("b")]);
    expect(() => applyMove(withoutHouse, { type: "play_hotel", playerId: "a", cardId: hotel.id, color: "red" })).toThrow();

    let state = baseState([
      player(
        "a",
        [],
        [],
        redSet,
        [
          { card: house, color: "red" },
          { card: hotel, color: "red" },
        ],
      ),
      player("b", [card("action-debt-collector", 0)]),
    ], "play", 1);

    state = applyMove(state, {
      type: "play_debt_collector",
      playerId: "b",
      cardId: state.players[1].hand[0].id,
      targetId: "a",
    }).state;
    state = applyMove(state, { type: "pay", playerId: "a", cardIds: [redSet[0].card.id, redSet[1].card.id] }).state;

    expect(state.players[0].bank.map((bankCard) => bankCard.action).sort()).toEqual(["hotel", "house"]);
    expect(state.players[0].buildings).toHaveLength(0);
  });

  it("allows wildcard reassignment only on the owner's turn and does not cost a play", () => {
    const wild = property("wild-red-yellow", "red", 0);
    const state = baseState([player("a", [], [], [wild]), player("b")]);

    const result = applyMove(state, {
      type: "reassign_wild",
      playerId: "a",
      cardId: wild.card.id,
      assignedColor: "yellow",
    }).state;

    expect(result.players[0].properties[0].assignedColor).toBe("yellow");
    expect(result.playsRemaining).toBe(3);

    expect(
      isMoveLegal(result, {
        type: "reassign_wild",
        playerId: "b",
        cardId: wild.card.id,
        assignedColor: "red",
      }),
    ).toBe(false);
  });
});

describe("set completion and win checks", () => {
  it("uses live rent rows and excludes prismatic-only complete sets", () => {
    const state = baseState([
      player("a", [], [], [property("wild-any", "brown", 0), property("wild-any", "brown", 1)]),
      player("b"),
    ]);

    expect(isCompleteSet(state.players[0], "brown")).toBe(false);

    state.players[0].properties.push(property("property-red", "red", 0), property("property-red", "red", 1));
    expect(rentForColor(state.players[0], "red")).toBe(3);
  });

  it("wins immediately when the active player completes a third different set", () => {
    const green = card("property-green", 2);
    const state = baseState([
      player(
        "a",
        [green],
        [],
        [
          property("property-brown", "brown", 0),
          property("property-brown", "brown", 1),
          property("property-dark-blue", "dark-blue", 0),
          property("property-dark-blue", "dark-blue", 1),
          property("property-green", "green", 0),
          property("property-green", "green", 1),
        ],
      ),
      player("b"),
    ]);

    const result = applyMove(state, {
      type: "play_property",
      playerId: "a",
      cardId: green.id,
      assignedColor: "green",
    }).state;

    expect(completeSetColors(result.players[0]).sort()).toEqual(["brown", "dark-blue", "green"].sort());
    expect(result.phase).toBe("game_over");
    expect(result.winnerId).toBe("a");
  });
});
