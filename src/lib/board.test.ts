import { describe, expect, test } from "bun:test";
import { buildMarkdown, DEFAULT_COLUMNS, normalizeBoard, seedBoard } from "./board";
import type { BoardState, Card } from "./types";

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
