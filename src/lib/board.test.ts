import { describe, expect, test } from "bun:test";
import {
  applyAddCard,
  applyAddColumn,
  applyAddComment,
  applyCommitAction,
  applyDeleteCard,
  applyDeleteColumn,
  applyDropCardAdjacent,
  applyDropCardOnCard,
  applyDropIntoActions,
  applyDropIntoColumn,
  applyReact,
  applyRenameColumn,
  applyRenameGroup,
  applyUnGroup,
  applyUpdateCard,
  buildMarkdown,
  DEFAULT_COLUMNS,
  normalizeBoard,
  seedBoard,
} from "./board";
import type { BoardState, Card } from "./types";

const ADA = { id: "u:ada", name: "Ada", color: "#abc" };

function makeBoard(cards: Card[] = [], opts: { groups?: BoardState["groups"]; actions?: string[]; layout?: BoardState["layout"] } = {}): BoardState {
  const b = seedBoard();
  for (const c of cards) {
    b.cards[c.id] = c;
    if (!opts.layout) {
      if (!c.isAction) b.layout[c.columnId] = [...(b.layout[c.columnId] || []), { type: "card", id: c.id }];
    }
  }
  if (opts.layout) b.layout = { ...b.layout, ...opts.layout };
  if (opts.groups) b.groups = opts.groups;
  if (opts.actions) b.actions = opts.actions;
  return b;
}

const stripDate = (s: string) => s.replace(/Hosted by ([^·]+) · [^\n]+/, "Hosted by $1· <DATE>");

const makeCard = (overrides: Partial<Card> & Pick<Card, "id" | "columnId" | "text" | "author">): Card => ({
  authorId: `user:${overrides.author}`,
  authorColor: "#000",
  comments: [],
  reactions: { up: [], celebrate: [], gratitude: [] },
  parentCardId: null,
  actionCardIds: [],
  isAction: false,
  ...overrides,
});

describe("seedBoard", () => {
  test("includes default columns with empty layouts", () => {
    const b = seedBoard();
    expect(b.columns.map((c) => c.id)).toEqual(DEFAULT_COLUMNS.map((c) => c.id));
    expect(b.columns.map((c) => c.title)).toEqual(DEFAULT_COLUMNS.map((c) => c.title));
    for (const col of DEFAULT_COLUMNS) {
      expect(b.layout[col.id]).toEqual([]);
    }
    expect(b.cards).toEqual({});
    expect(b.groups).toEqual({});
    expect(b.actions).toEqual([]);
  });

  test("returns fresh copies — mutating one board does not leak", () => {
    const a = seedBoard();
    a.columns[0].title = "Mutated";
    a.layout[DEFAULT_COLUMNS[0].id].push({ type: "card", id: "x" });
    const b = seedBoard();
    expect(b.columns[0].title).toBe(DEFAULT_COLUMNS[0].title);
    expect(b.layout[DEFAULT_COLUMNS[0].id]).toEqual([]);
  });
});

describe("normalizeBoard", () => {
  test("converts legacy string[] reactions to ReactionVote[] with legacy: id prefix", () => {
    const legacy = {
      ...seedBoard(),
      cards: {
        c1: {
          id: "c1",
          columnId: "col_w",
          text: "hi",
          author: "Ada",
          authorColor: "#abc",
          comments: [{ id: "cm1", text: "yo", author: "Bo", authorColor: "#def" }],
          reactions: { up: ["Ada", "Bo"], celebrate: ["Ada"], gratitude: [] },
          parentCardId: null,
          actionCardIds: [],
          isAction: false,
        },
      },
    } as unknown as BoardState;

    const n = normalizeBoard(legacy);
    const c = n.cards.c1;
    expect(c.authorId).toBe("legacy:Ada");
    expect(c.reactions.up).toEqual([
      { id: "legacy:Ada", name: "Ada" },
      { id: "legacy:Bo", name: "Bo" },
    ]);
    expect(c.reactions.celebrate).toEqual([{ id: "legacy:Ada", name: "Ada" }]);
    expect(c.reactions.gratitude).toEqual([]);
    expect(c.comments[0].authorId).toBe("legacy:Bo");
  });

  test("is idempotent on already-normalized input", () => {
    const board: BoardState = {
      ...seedBoard(),
      cards: {
        c1: makeCard({
          id: "c1",
          columnId: "col_w",
          text: "ok",
          author: "Ada",
          reactions: {
            up: [{ id: "peer:1", name: "Ada" }],
            celebrate: [],
            gratitude: [],
          },
        }),
      },
    };
    const once = normalizeBoard(board);
    const twice = normalizeBoard(once);
    expect(twice).toEqual(once);
    expect(twice.cards.c1.reactions.up).toEqual([{ id: "peer:1", name: "Ada" }]);
    expect(twice.cards.c1.authorId).toBe("user:Ada");
  });
});

describe("buildMarkdown", () => {
  test("empty board", () => {
    const md = stripDate(buildMarkdown(seedBoard(), "Retro", "Ada"));
    expect(md).toMatchSnapshot();
  });

  test("one card", () => {
    const b = seedBoard();
    b.cards.c1 = makeCard({ id: "c1", columnId: "col_w", text: "Shipping went smooth", author: "Ada" });
    b.layout.col_w.push({ type: "card", id: "c1" });
    const md = stripDate(buildMarkdown(b, "Retro", "Ada"));
    expect(md).toMatchSnapshot();
  });

  test("card with reactions and comments", () => {
    const b = seedBoard();
    b.cards.c1 = makeCard({
      id: "c1",
      columnId: "col_d",
      text: "Flaky tests",
      author: "Bo",
      reactions: {
        up: [
          { id: "p:1", name: "Ada" },
          { id: "p:2", name: "Cy" },
        ],
        celebrate: [],
        gratitude: [{ id: "p:1", name: "Ada" }],
      },
      comments: [
        { id: "cm1", text: "agreed", author: "Ada", authorId: "p:1", authorColor: "#aaa" },
      ],
    });
    b.layout.col_d.push({ type: "card", id: "c1" });
    const md = stripDate(buildMarkdown(b, "Retro", "Ada"));
    expect(md).toMatchSnapshot();
  });
});

describe("applyAddCard", () => {
  test("inserts card and appends to column layout", () => {
    const b = seedBoard();
    const next = applyAddCard(b, { id: "c1", columnId: "col_w", text: "ship", author: ADA });
    expect(next.cards.c1).toMatchObject({
      id: "c1",
      columnId: "col_w",
      text: "ship",
      author: "Ada",
      authorId: "u:ada",
      authorColor: "#abc",
      isAction: false,
      parentCardId: null,
      actionCardIds: [],
      comments: [],
    });
    expect(next.cards.c1.reactions).toEqual({ up: [], celebrate: [], gratitude: [] });
    expect(next.layout.col_w).toEqual([{ type: "card", id: "c1" }]);
  });

  test("does not mutate input", () => {
    const b = seedBoard();
    applyAddCard(b, { id: "c1", columnId: "col_w", text: "ship", author: ADA });
    expect(b.cards.c1).toBeUndefined();
    expect(b.layout.col_w).toEqual([]);
  });
});

describe("applyUpdateCard", () => {
  test("merges patch into card", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "old", author: "Ada" });
    const b = makeBoard([c1]);
    const next = applyUpdateCard(b, { id: "c1", patch: { text: "new", assignee: "Bo" } });
    expect(next.cards.c1.text).toBe("new");
    expect(next.cards.c1.assignee).toBe("Bo");
  });
});

describe("applyDeleteCard", () => {
  test("no-op when card missing", () => {
    const b = seedBoard();
    expect(applyDeleteCard(b, { id: "nope" })).toBe(b);
  });

  test("removes free card from layout and cards", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Ada" });
    const b = makeBoard([c1]);
    const next = applyDeleteCard(b, { id: "c1" });
    expect(next.cards.c1).toBeUndefined();
    expect(next.layout.col_w).toEqual([]);
  });

  test("removes card from group; group survives when other members remain", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "c", author: "Ada" });
    const b = makeBoard([c1, c2, c3], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "Cluster", cardIds: ["c1", "c2", "c3"] } },
      layout: { col_w: [{ type: "group", id: "g1" }], col_d: [], col_q: [] },
    });
    const next = applyDeleteCard(b, { id: "c2" });
    expect(next.groups.g1.cardIds).toEqual(["c1", "c3"]);
    expect(next.cards.c2).toBeUndefined();
  });

  test("deleting last group member dissolves the group and removes it from layout", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const b = makeBoard([c1], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "Cluster", cardIds: ["c1"] } },
      layout: { col_w: [{ type: "group", id: "g1" }], col_d: [], col_q: [] },
    });
    const next = applyDeleteCard(b, { id: "c1" });
    expect(next.groups.g1).toBeUndefined();
    expect(next.layout.col_w).toEqual([]);
    expect(next.cards.c1).toBeUndefined();
  });

  test("deleting parent of an action nulls action's parentCardId", () => {
    const parent = makeCard({
      id: "c1", columnId: "col_w", text: "src", author: "Ada", actionCardIds: ["a1"],
    });
    const action = makeCard({
      id: "a1", columnId: "actions", text: "do it", author: "Ada", isAction: true, parentCardId: "c1",
    });
    const b = makeBoard([parent, action], { actions: ["a1"] });
    const next = applyDeleteCard(b, { id: "c1" });
    expect(next.cards.c1).toBeUndefined();
    expect(next.cards.a1.parentCardId).toBeNull();
    expect(next.actions).toEqual(["a1"]);
  });

  test("deleting action removes it from actions[] and parent.actionCardIds", () => {
    const parent = makeCard({
      id: "c1", columnId: "col_w", text: "src", author: "Ada", actionCardIds: ["a1"],
    });
    const action = makeCard({
      id: "a1", columnId: "actions", text: "do it", author: "Ada", isAction: true, parentCardId: "c1",
    });
    const b = makeBoard([parent, action], { actions: ["a1"] });
    const next = applyDeleteCard(b, { id: "a1" });
    expect(next.cards.a1).toBeUndefined();
    expect(next.actions).toEqual([]);
    expect(next.cards.c1.actionCardIds).toEqual([]);
  });
});

describe("applyAddComment", () => {
  test("appends comment to card", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Ada" });
    const b = makeBoard([c1]);
    const next = applyAddComment(b, { cardId: "c1", commentId: "cm1", text: "yo", author: ADA });
    expect(next.cards.c1.comments).toEqual([
      { id: "cm1", text: "yo", author: "Ada", authorId: "u:ada", authorColor: "#abc" },
    ]);
  });

  test("no-op when card missing", () => {
    const b = seedBoard();
    expect(applyAddComment(b, { cardId: "nope", commentId: "cm1", text: "yo", author: ADA })).toBe(b);
  });
});

describe("applyReact", () => {
  const voter = { id: "u:ada", name: "Ada" };

  test("adds when absent", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Bo" });
    const b = makeBoard([c1]);
    const next = applyReact(b, { cardId: "c1", kind: "up", voter });
    expect(next.cards.c1.reactions.up).toEqual([voter]);
  });

  test("removes when present", () => {
    const c1 = makeCard({
      id: "c1", columnId: "col_w", text: "x", author: "Bo",
      reactions: { up: [voter], celebrate: [], gratitude: [] },
    });
    const b = makeBoard([c1]);
    const next = applyReact(b, { cardId: "c1", kind: "up", voter });
    expect(next.cards.c1.reactions.up).toEqual([]);
  });

  test("idempotent on double toggle", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Bo" });
    const b = makeBoard([c1]);
    const once = applyReact(b, { cardId: "c1", kind: "up", voter });
    const twice = applyReact(once, { cardId: "c1", kind: "up", voter });
    expect(twice.cards.c1.reactions.up).toEqual([]);
  });
});

describe("applyCommitAction", () => {
  test("creates linked action card", () => {
    const parent = makeCard({ id: "c1", columnId: "col_w", text: "src", author: "Ada" });
    const b = makeBoard([parent]);
    const next = applyCommitAction(b, {
      id: "a1", parentId: "c1", text: "do it", author: ADA, assignee: "Bo", dueDate: "2026-06-01",
    });
    expect(next.cards.a1).toMatchObject({
      id: "a1", columnId: "actions", text: "do it",
      isAction: true, parentCardId: "c1", assignee: "Bo", dueDate: "2026-06-01",
    });
    expect(next.cards.c1.actionCardIds).toEqual(["a1"]);
    expect(next.actions).toEqual(["a1"]);
  });

  test("no-op when parent missing", () => {
    const b = seedBoard();
    expect(applyCommitAction(b, { id: "a1", parentId: "nope", text: "x", author: ADA, assignee: null, dueDate: null })).toBe(b);
  });
});

describe("applyAddColumn / applyRenameColumn", () => {
  test("adds column with empty layout", () => {
    const b = seedBoard();
    const next = applyAddColumn(b, { id: "col_x", title: "New column" });
    expect(next.columns.at(-1)).toEqual({ id: "col_x", title: "New column" });
    expect(next.layout.col_x).toEqual([]);
  });

  test("renames the matching column only", () => {
    const b = seedBoard();
    const next = applyRenameColumn(b, { id: "col_w", title: "Wins" });
    expect(next.columns.find((c) => c.id === "col_w")?.title).toBe("Wins");
    expect(next.columns.find((c) => c.id === "col_d")?.title).toBe("Didn't go well");
  });
});

describe("applyDeleteColumn", () => {
  test("refuses to delete the last column", () => {
    const b: BoardState = { ...seedBoard(), columns: [{ id: "only", title: "Only" }], layout: { only: [] } };
    expect(applyDeleteColumn(b, { id: "only" })).toBe(b);
  });

  test("removes column + its cards/groups; nulls parentCardId on linked actions", () => {
    const c1 = makeCard({
      id: "c1", columnId: "col_w", text: "src", author: "Ada", actionCardIds: ["a1"],
    });
    const action = makeCard({
      id: "a1", columnId: "actions", text: "do it", author: "Ada", isAction: true, parentCardId: "c1",
    });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "grouped", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "grouped2", author: "Ada" });
    const b = makeBoard([c1, c2, c3, action], {
      actions: ["a1"],
      groups: { g1: { id: "g1", columnId: "col_w", label: "Cluster", cardIds: ["c2", "c3"] } },
      layout: {
        col_w: [{ type: "card", id: "c1" }, { type: "group", id: "g1" }],
        col_d: [], col_q: [],
      },
    });
    const next = applyDeleteColumn(b, { id: "col_w" });
    expect(next.columns.find((c) => c.id === "col_w")).toBeUndefined();
    expect(next.layout.col_w).toBeUndefined();
    expect(next.cards.c1).toBeUndefined();
    expect(next.cards.c2).toBeUndefined();
    expect(next.cards.c3).toBeUndefined();
    expect(next.groups.g1).toBeUndefined();
    expect(next.cards.a1.parentCardId).toBeNull();
  });
});

describe("applyDropIntoColumn", () => {
  test("moves free card to new column", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Ada" });
    const b = makeBoard([c1]);
    const next = applyDropIntoColumn(b, { cardId: "c1", targetColId: "col_d" });
    expect(next.layout.col_w).toEqual([]);
    expect(next.layout.col_d).toEqual([{ type: "card", id: "c1" }]);
    expect(next.cards.c1.columnId).toBe("col_d");
  });

  test("dissolves empty group when last member dragged out", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const b = makeBoard([c1], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "C", cardIds: ["c1"] } },
      layout: { col_w: [{ type: "group", id: "g1" }], col_d: [], col_q: [] },
    });
    const next = applyDropIntoColumn(b, { cardId: "c1", targetColId: "col_d" });
    expect(next.groups.g1).toBeUndefined();
    expect(next.layout.col_w).toEqual([]);
    expect(next.layout.col_d).toEqual([{ type: "card", id: "c1" }]);
  });

  test("refuses to move an action card", () => {
    const action = makeCard({
      id: "a1", columnId: "actions", text: "x", author: "Ada", isAction: true,
    });
    const b = makeBoard([action]);
    expect(applyDropIntoColumn(b, { cardId: "a1", targetColId: "col_d" })).toBe(b);
  });
});

describe("applyDropIntoActions", () => {
  test("moves action card to end of actions[]", () => {
    const a1 = makeCard({ id: "a1", columnId: "actions", text: "1", author: "Ada", isAction: true });
    const a2 = makeCard({ id: "a2", columnId: "actions", text: "2", author: "Ada", isAction: true });
    const b = makeBoard([a1, a2], { actions: ["a1", "a2"] });
    const next = applyDropIntoActions(b, { cardId: "a1" });
    expect(next.actions).toEqual(["a2", "a1"]);
  });

  test("no-op for non-action card", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "x", author: "Ada" });
    const b = makeBoard([c1]);
    expect(applyDropIntoActions(b, { cardId: "c1" })).toBe(b);
  });
});

describe("applyDropCardOnCard", () => {
  test("creates new group with both cards when target is free", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const b = makeBoard([c1, c2]);
    const next = applyDropCardOnCard(b, { draggedId: "c2", targetId: "c1", newGroupId: "g_new" });
    expect(next.groups.g_new).toEqual({
      id: "g_new", columnId: "col_w", label: "Cluster", cardIds: ["c1", "c2"],
    });
    expect(next.layout.col_w).toEqual([{ type: "group", id: "g_new" }]);
  });

  test("merges into existing group when target is in one", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "c", author: "Ada" });
    const b = makeBoard([c1, c2, c3], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "C", cardIds: ["c1", "c2"] } },
      layout: { col_w: [{ type: "group", id: "g1" }, { type: "card", id: "c3" }], col_d: [], col_q: [] },
    });
    const next = applyDropCardOnCard(b, { draggedId: "c3", targetId: "c1", newGroupId: "g_new" });
    expect(next.groups.g1.cardIds).toEqual(["c1", "c2", "c3"]);
    expect(next.groups.g_new).toBeUndefined();
    expect(next.layout.col_w).toEqual([{ type: "group", id: "g1" }]);
  });

  test("no-op when dropping on self", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const b = makeBoard([c1]);
    expect(applyDropCardOnCard(b, { draggedId: "c1", targetId: "c1", newGroupId: "g_new" })).toBe(b);
  });
});

describe("applyDropCardAdjacent", () => {
  test("inserts before target inside a group", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "c", author: "Ada" });
    const b = makeBoard([c1, c2, c3], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "C", cardIds: ["c1", "c2"] } },
      layout: { col_w: [{ type: "group", id: "g1" }, { type: "card", id: "c3" }], col_d: [], col_q: [] },
    });
    const next = applyDropCardAdjacent(b, { draggedId: "c3", targetId: "c2", where: "before" });
    expect(next.groups.g1.cardIds).toEqual(["c1", "c3", "c2"]);
    expect(next.layout.col_w).toEqual([{ type: "group", id: "g1" }]);
  });

  test("inserts after target inside a group", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "c", author: "Ada" });
    const b = makeBoard([c1, c2, c3], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "C", cardIds: ["c1", "c2"] } },
      layout: { col_w: [{ type: "group", id: "g1" }, { type: "card", id: "c3" }], col_d: [], col_q: [] },
    });
    const next = applyDropCardAdjacent(b, { draggedId: "c3", targetId: "c1", where: "after" });
    expect(next.groups.g1.cardIds).toEqual(["c1", "c3", "c2"]);
  });

  test("inserts before target in column layout when target is free", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "b", author: "Ada" });
    const b = makeBoard([c1, c2]);
    const next = applyDropCardAdjacent(b, { draggedId: "c2", targetId: "c1", where: "before" });
    expect(next.layout.col_w).toEqual([
      { type: "card", id: "c2" },
      { type: "card", id: "c1" },
    ]);
  });
});

describe("applyUnGroup", () => {
  test("expands group's cards into column at the group's old index", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "head", author: "Ada" });
    const c2 = makeCard({ id: "c2", columnId: "col_w", text: "a", author: "Ada" });
    const c3 = makeCard({ id: "c3", columnId: "col_w", text: "b", author: "Ada" });
    const c4 = makeCard({ id: "c4", columnId: "col_w", text: "tail", author: "Ada" });
    const b = makeBoard([c1, c2, c3, c4], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "C", cardIds: ["c2", "c3"] } },
      layout: {
        col_w: [
          { type: "card", id: "c1" },
          { type: "group", id: "g1" },
          { type: "card", id: "c4" },
        ],
        col_d: [], col_q: [],
      },
    });
    const next = applyUnGroup(b, { groupId: "g1" });
    expect(next.groups.g1).toBeUndefined();
    expect(next.layout.col_w).toEqual([
      { type: "card", id: "c1" },
      { type: "card", id: "c2" },
      { type: "card", id: "c3" },
      { type: "card", id: "c4" },
    ]);
  });

  test("no-op when group missing", () => {
    const b = seedBoard();
    expect(applyUnGroup(b, { groupId: "nope" })).toBe(b);
  });
});

describe("applyRenameGroup", () => {
  test("updates label only", () => {
    const c1 = makeCard({ id: "c1", columnId: "col_w", text: "a", author: "Ada" });
    const b = makeBoard([c1], {
      groups: { g1: { id: "g1", columnId: "col_w", label: "Old", cardIds: ["c1"] } },
    });
    const next = applyRenameGroup(b, { groupId: "g1", label: "New" });
    expect(next.groups.g1.label).toBe("New");
    expect(next.groups.g1.cardIds).toEqual(["c1"]);
  });
});
