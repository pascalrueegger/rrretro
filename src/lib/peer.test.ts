import { describe, expect, test } from "bun:test";
import {
  LEGACY_NO_TOKEN_ACCEPT,
  PeerMessageSchema,
  PeerNet,
  RECONNECT_BACKOFF_MS,
  verifyHelloToken,
  type PeerMessage,
  type PeerState,
} from "./peer";
import { seedBoard } from "./board";
import type { SessionInfo, Participant, BoardState } from "./types";

const participant: Participant = {
  id: "u1", name: "Ada", color: "#abc", initial: "A",
};

const session: SessionInfo = {
  id: "s_ABC123", title: "Retro", code: "ABC123", hostName: "Ada",
  sharing: true, createdAt: 1, joinToken: "tok-xyz",
};

const board: BoardState = seedBoard();

function rt(msg: PeerMessage) {
  const wire = JSON.stringify(msg);
  return PeerMessageSchema.safeParse(JSON.parse(wire));
}

/* ─── Schema variants ──────────────────────────────────────────────── */

describe("PeerMessageSchema round-trips", () => {
  test("hello (with token)", () => {
    const r = rt({ type: "hello", participant, token: "tok-xyz" });
    expect(r.success).toBe(true);
  });

  test("hello (no token)", () => {
    const r = rt({ type: "hello", participant });
    expect(r.success).toBe(true);
  });

  test("snapshot", () => {
    const r = rt({ type: "snapshot", session, board, participants: [participant] });
    expect(r.success).toBe(true);
  });

  test("board", () => {
    const r = rt({ type: "board", board });
    expect(r.success).toBe(true);
  });

  test("session", () => {
    const r = rt({ type: "session", session });
    expect(r.success).toBe(true);
  });

  test("presence", () => {
    const r = rt({ type: "presence", participants: [participant] });
    expect(r.success).toBe(true);
  });

  test("bye", () => {
    const r = rt({ type: "bye", participantId: "u1" });
    expect(r.success).toBe(true);
  });

  test("typing", () => {
    const r = rt({ type: "typing", participant, columnId: "col_w", active: true });
    expect(r.success).toBe(true);
  });

  test("reject", () => {
    const r = rt({ type: "reject", reason: "bad-token" });
    expect(r.success).toBe(true);
    const r2 = rt({ type: "reject", reason: "session-closed" });
    expect(r2.success).toBe(true);
  });
});

describe("PeerMessageSchema rejects malformed", () => {
  test("missing type", () => {
    expect(PeerMessageSchema.safeParse({ participant }).success).toBe(false);
  });

  test("unknown type", () => {
    expect(PeerMessageSchema.safeParse({ type: "garbage" }).success).toBe(false);
  });

  test("hello missing participant", () => {
    expect(PeerMessageSchema.safeParse({ type: "hello" }).success).toBe(false);
  });

  test("typing with wrong-type active", () => {
    expect(
      PeerMessageSchema.safeParse({
        type: "typing", participant, columnId: "c", active: "yes",
      }).success
    ).toBe(false);
  });

  test("reject with bad reason", () => {
    expect(
      PeerMessageSchema.safeParse({ type: "reject", reason: "whatever" }).success
    ).toBe(false);
  });

  test("board with non-object cards", () => {
    expect(
      PeerMessageSchema.safeParse({ type: "board", board: { ...board, cards: [] } }).success
    ).toBe(false);
  });
});

describe("legacy reactions tolerated", () => {
  test("string[] reactions coerce to ReactionVote[]", () => {
    const legacyBoard = {
      ...seedBoard(),
      cards: {
        c1: {
          id: "c1", columnId: "col_w", text: "x", author: "Ada",
          authorId: "u:ada", authorColor: "#abc",
          comments: [],
          // Legacy shape: names as plain strings.
          reactions: { up: ["Ada", "Ben"], celebrate: [], gratitude: [] },
          parentCardId: null, actionCardIds: [], isAction: false,
        },
      },
    };
    const r = PeerMessageSchema.safeParse({ type: "board", board: legacyBoard });
    expect(r.success).toBe(true);
    if (!r.success) return;
    if (r.data.type !== "board") return;
    const card = r.data.board.cards.c1;
    expect(card.reactions.up).toEqual([
      { id: "legacy:Ada", name: "Ada" },
      { id: "legacy:Ben", name: "Ben" },
    ]);
  });
});

/* ─── Token verification ───────────────────────────────────────────── */

describe("verifyHelloToken", () => {
  test("correct token accepted", () => {
    expect(verifyHelloToken({ expected: "abc", provided: "abc" })).toBe(true);
  });

  test("wrong token rejected", () => {
    expect(verifyHelloToken({ expected: "abc", provided: "xyz" })).toBe(false);
  });

  test("missing provided when expected → rejected", () => {
    expect(verifyHelloToken({ expected: "abc", provided: undefined })).toBe(false);
  });

  test("legacy session (no expected) accepted under flag", () => {
    expect(verifyHelloToken({ expected: undefined, provided: undefined, legacyAccept: true })).toBe(true);
    expect(verifyHelloToken({ expected: undefined, provided: "anything", legacyAccept: true })).toBe(true);
  });

  test("legacy session rejected when flag off", () => {
    expect(verifyHelloToken({ expected: undefined, provided: undefined, legacyAccept: false })).toBe(false);
  });

  test("default flag mirrors LEGACY_NO_TOKEN_ACCEPT", () => {
    expect(verifyHelloToken({ expected: undefined, provided: undefined })).toBe(LEGACY_NO_TOKEN_ACCEPT);
  });
});

/* ─── Reconnect/backoff ────────────────────────────────────────────── */

describe("PeerNet reconnect", () => {
  test("backoff schedule deterministic + capped", () => {
    expect(RECONNECT_BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 15000]);
  });

  test("scheduleReconnect uses injected setTimeout and transitions state", () => {
    type Timer = { fn: () => void; ms: number; cleared: boolean };
    const timers: Timer[] = [];
    const states: PeerState[] = [];

    const net = new PeerNet(
      { onState: (s) => states.push(s) },
      {
        setTimeout: (fn, ms) => {
          const t: Timer = { fn, ms, cleared: false };
          timers.push(t);
          return t;
        },
        clearTimeout: (id) => { (id as Timer).cleared = true; },
      },
    );

    // Seam: drive private state without bringing up real PeerJS.
    const inner = net as unknown as {
      role: "host" | "guest" | null;
      guestCode: string | null;
      retryAttempt: number;
      retryTimer: unknown;
      scheduleReconnect(): void;
    };
    inner.role = "guest";
    inner.guestCode = "ABC123";

    inner.scheduleReconnect();
    expect(states).toEqual(["reconnecting"]);
    expect(timers.length).toBe(1);
    expect(timers[0].ms).toBe(1000);

    // While a timer is pending, scheduleReconnect should no-op.
    inner.scheduleReconnect();
    expect(timers.length).toBe(1);

    // Simulate next attempts by clearing the timer and forcing retryAttempt.
    inner.retryTimer = null;
    inner.scheduleReconnect();
    expect(timers[1].ms).toBe(2000);

    inner.retryTimer = null;
    inner.scheduleReconnect();
    expect(timers[2].ms).toBe(4000);

    inner.retryTimer = null;
    inner.scheduleReconnect();
    expect(timers[3].ms).toBe(8000);

    inner.retryTimer = null;
    inner.scheduleReconnect();
    expect(timers[4].ms).toBe(15000);

    // Cap holds.
    inner.retryTimer = null;
    inner.scheduleReconnect();
    expect(timers[5].ms).toBe(15000);

    net.close();
    expect(states[states.length - 1]).toBe("closed");
  });

  test("close cancels pending retry timer", () => {
    type Timer = { fn: () => void; ms: number; cleared: boolean };
    const timers: Timer[] = [];
    const net = new PeerNet(
      {},
      {
        setTimeout: (fn, ms) => {
          const t: Timer = { fn, ms, cleared: false };
          timers.push(t);
          return t;
        },
        clearTimeout: (id) => { (id as Timer).cleared = true; },
      },
    );
    const inner = net as unknown as {
      role: "host" | "guest" | null;
      guestCode: string | null;
      scheduleReconnect(): void;
    };
    inner.role = "guest";
    inner.guestCode = "ABC";
    inner.scheduleReconnect();
    expect(timers[0].cleared).toBe(false);
    net.close();
    expect(timers[0].cleared).toBe(true);
  });

  test("host role schedules reconnect on broker failure", () => {
    const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
    const net = new PeerNet(
      {},
      {
        setTimeout: (fn, ms) => {
          timers.push({ fn, ms, cleared: false });
          return timers.length - 1;
        },
        clearTimeout: (id) => { timers[id as number].cleared = true; },
      },
    );
    const inner = net as unknown as {
      role: "host" | "guest" | null;
      hostCode: string | null;
      scheduleReconnect(): void;
    };
    inner.role = "host";
    inner.hostCode = "ABC";
    inner.scheduleReconnect();
    expect(timers.length).toBe(1);
    expect(timers[0].ms).toBe(1000);
    net.close();
    expect(timers[0].cleared).toBe(true);
  });

  test("scheduleReconnect is a no-op before a role is assigned", () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const net = new PeerNet(
      {},
      {
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; },
        clearTimeout: () => {},
      },
    );
    (net as unknown as { scheduleReconnect(): void }).scheduleReconnect();
    expect(timers.length).toBe(0);
    net.close();
  });
});
