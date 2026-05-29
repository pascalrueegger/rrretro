"use client";

import { z } from "zod";
import type { DataConnection, Peer as PeerType } from "peerjs";
import { normalizeBoard } from "./board";

const PEER_ID_PREFIX = "rrretro-v1-";
export const peerIdFor = (code: string) => `${PEER_ID_PREFIX}${code.toLowerCase()}`;

// Legacy grace: live sessions created before joinToken existed have no token
// persisted. While this flag is on, the host accepts hellos against a tokenless
// session so an upgrade-in-place doesn't kick existing guests. Flip off after
// one rollout — by then every session has a token from its next save.
export const LEGACY_NO_TOKEN_ACCEPT = true;

// Backoff schedule for guest-side reconnect. Index n caps at the last entry.
export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

function backoffFor(attempt: number): number {
  const last = RECONNECT_BACKOFF_MS.length - 1;
  return RECONNECT_BACKOFF_MS[Math.min(attempt, last)];
}

/* ─── Schemas ──────────────────────────────────────────────────────── */

const ReactionVoteSchema = z.object({ id: z.string(), name: z.string() });

// Tolerate legacy reactions stored as plain name strings — coerce to votes
// so the inferred PeerMessage type stays aligned with types.ts.
const ReactionVoteCoerced = z.preprocess(
  (v) => (typeof v === "string" ? { id: `legacy:${v}`, name: v } : v),
  ReactionVoteSchema,
);

const ReactionsSchema = z.object({
  up: z.array(ReactionVoteCoerced),
  celebrate: z.array(ReactionVoteCoerced),
  gratitude: z.array(ReactionVoteCoerced),
});

const CommentSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.string(),
  authorId: z.string(),
  authorColor: z.string(),
});

const CardSchema = z.object({
  id: z.string(),
  columnId: z.string(),
  text: z.string(),
  author: z.string(),
  authorId: z.string(),
  authorColor: z.string(),
  comments: z.array(CommentSchema),
  reactions: ReactionsSchema,
  parentCardId: z.string().nullable(),
  actionCardIds: z.array(z.string()),
  isAction: z.boolean(),
  assignee: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
});

const ColumnSchema = z.object({
  id: z.string(),
  title: z.string(),
  locked: z.boolean().optional(),
});

const LayoutItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("card"), id: z.string() }),
  z.object({ type: z.literal("group"), id: z.string() }),
]);

const GroupSchema = z.object({
  id: z.string(),
  columnId: z.string(),
  label: z.string(),
  cardIds: z.array(z.string()),
});

const BoardStateSchema = z.object({
  columns: z.array(ColumnSchema),
  layout: z.record(z.string(), z.array(LayoutItemSchema)),
  cards: z.record(z.string(), CardSchema),
  groups: z.record(z.string(), GroupSchema),
  actions: z.array(z.string()),
});

const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string(),
  hostName: z.string(),
  hostPeerId: z.string().nullable().optional(),
  sharing: z.boolean(),
  createdAt: z.number(),
  joinToken: z.string().optional(),
});

const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  initial: z.string(),
});

export const PeerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    participant: ParticipantSchema,
    // Capability token from the URL fragment. Not cryptographic auth — anyone
    // with the share link has it. The point: the 6-char code alone no longer
    // grants join.
    token: z.string().optional(),
  }),
  z.object({
    type: z.literal("snapshot"),
    session: SessionInfoSchema,
    board: BoardStateSchema,
    participants: z.array(ParticipantSchema),
  }),
  z.object({ type: z.literal("board"), board: BoardStateSchema }),
  z.object({ type: z.literal("session"), session: SessionInfoSchema }),
  z.object({ type: z.literal("presence"), participants: z.array(ParticipantSchema) }),
  z.object({ type: z.literal("bye"), participantId: z.string() }),
  z.object({
    type: z.literal("typing"),
    participant: ParticipantSchema,
    columnId: z.string(),
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("reject"),
    reason: z.enum(["bad-token", "session-closed"]),
  }),
]);

export type PeerMessage = z.infer<typeof PeerMessageSchema>;

export function verifyHelloToken(opts: {
  expected: string | undefined;
  provided: string | undefined;
  legacyAccept?: boolean;
}): boolean {
  if (opts.expected) return opts.provided === opts.expected;
  return opts.legacyAccept ?? LEGACY_NO_TOKEN_ACCEPT;
}

function normalizeMessage(msg: PeerMessage): PeerMessage {
  if (msg.type === "snapshot") return { ...msg, board: normalizeBoard(msg.board) };
  if (msg.type === "board") return { ...msg, board: normalizeBoard(msg.board) };
  return msg;
}

/* ─── PeerNet ──────────────────────────────────────────────────────── */

export type PeerState = "connecting" | "open" | "reconnecting" | "closed";

export interface PeerHandlers {
  onOpen?: (id: string) => void;
  onConnect?: (conn: DataConnection) => void;
  onMessage?: (msg: PeerMessage, conn: DataConnection) => void;
  onDisconnect?: (conn: DataConnection) => void;
  onError?: (err: Error) => void;
  onState?: (state: PeerState) => void;
}

export interface PeerNetOptions {
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

type ScheduleTimer = (fn: () => void, ms: number) => unknown;
type CancelTimer = (id: unknown) => void;

async function loadPeerJs(): Promise<typeof import("peerjs")> {
  return await import("peerjs");
}

export class PeerNet {
  private handlers: PeerHandlers;
  private peer: PeerType | null = null;
  private conns: Map<string, DataConnection> = new Map();
  private closed = false;
  private state: PeerState = "connecting";
  private role: "host" | "guest" | null = null;
  private guestCode: string | null = null;
  private hostCode: string | null = null;
  private retryAttempt = 0;
  private retryTimer: unknown = null;
  private readonly setTimeoutImpl: ScheduleTimer;
  private readonly clearTimeoutImpl: CancelTimer;

  constructor(handlers: PeerHandlers, options: PeerNetOptions = {}) {
    this.handlers = handlers;
    this.setTimeoutImpl =
      options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimeoutImpl =
      options.clearTimeout ?? ((id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>));
  }

  async startHost(code: string) {
    this.role = "host";
    this.hostCode = code;
    this.setState("connecting");
    await this.connectAsHost();
  }

  private async connectAsHost() {
    if (this.closed) return;
    const { Peer } = await loadPeerJs();
    if (this.closed) return;
    this.peer = new Peer(peerIdFor(this.hostCode!));
    this.peer.on("open", (id) => {
      if (this.closed) return;
      this.retryAttempt = 0;
      this.setState("open");
      this.handlers.onOpen?.(id);
    });
    this.peer.on("disconnected", () => {
      if (this.closed) return;
      // Broker WS dropped but peer alive — cheap reconnect, keeps same ID.
      try { this.peer?.reconnect(); } catch {
        // peer destroyed mid-flight — full retry will pick up
      }
    });
    this.peer.on("error", (err) => {
      if (this.closed) return;
      this.handlers.onError?.(err);
      const t = (err as { type?: string }).type;
      if (
        t === "network" ||
        t === "server-error" ||
        t === "socket-error" ||
        t === "socket-closed" ||
        t === "unavailable-id"
      ) {
        this.scheduleReconnect();
      }
    });
    this.peer.on("connection", (conn) => this.attachConn(conn));
  }

  async startGuest(code: string) {
    this.role = "guest";
    this.guestCode = code;
    this.setState("connecting");
    await this.connectAsGuest();
  }

  private async connectAsGuest() {
    if (this.closed) return;
    const { Peer } = await loadPeerJs();
    if (this.closed) return;
    this.peer = new Peer();
    this.peer.on("open", (id) => {
      if (this.closed) return;
      this.handlers.onOpen?.(id);
      const conn = this.peer!.connect(peerIdFor(this.guestCode!), { reliable: true });
      this.attachConn(conn);
      const timer = this.setTimeoutImpl(() => {
        if (this.closed) return;
        if (!conn.open) {
          const err = new Error("Host unreachable") as Error & { type: string };
          err.type = "peer-unavailable";
          this.handlers.onError?.(err);
          this.scheduleReconnect();
        }
      }, 8000);
      conn.on("open", () => this.clearTimeoutImpl(timer));
      conn.on("close", () => this.clearTimeoutImpl(timer));
    });
    this.peer.on("disconnected", () => {
      if (this.closed) return;
      try { this.peer?.reconnect(); } catch {
        // peer destroyed mid-flight — full retry will pick up
      }
    });
    this.peer.on("error", (err) => {
      if (this.closed) return;
      this.handlers.onError?.(err);
      const t = (err as { type?: string }).type;
      if (
        t === "peer-unavailable" ||
        t === "network" ||
        t === "server-error" ||
        t === "socket-error" ||
        t === "socket-closed"
      ) {
        this.scheduleReconnect();
      }
    });
  }

  private attachConn(conn: DataConnection) {
    conn.on("open", () => {
      if (this.closed) return;
      this.conns.set(conn.peer, conn);
      this.retryAttempt = 0;
      this.setState("open");
      this.handlers.onConnect?.(conn);
    });
    conn.on("data", (raw) => {
      if (this.closed) return;
      let parsed: unknown;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        this.emitInvalid();
        return;
      }
      const result = PeerMessageSchema.safeParse(parsed);
      if (!result.success) {
        this.emitInvalid(result.error);
        return;
      }
      this.handlers.onMessage?.(normalizeMessage(result.data), conn);
    });
    conn.on("close", () => {
      this.conns.delete(conn.peer);
      if (this.closed) return;
      this.handlers.onDisconnect?.(conn);
      if (this.role === "guest") this.scheduleReconnect();
    });
    conn.on("error", () => {
      this.conns.delete(conn.peer);
      if (this.closed) return;
      this.handlers.onDisconnect?.(conn);
      if (this.role === "guest") this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    if (this.role === null) return;
    if (this.retryTimer !== null) return;
    this.setState("reconnecting");
    const delay = backoffFor(this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = this.setTimeoutImpl(() => {
      this.retryTimer = null;
      if (this.closed) return;
      try {
        this.peer?.destroy();
      } catch {
        // peer may already be torn down
      }
      this.peer = null;
      if (this.role === "host") void this.connectAsHost();
      else void this.connectAsGuest();
    }, delay);
  }

  private setState(next: PeerState) {
    if (this.state === next) return;
    this.state = next;
    this.handlers.onState?.(next);
  }

  private emitInvalid(cause?: unknown) {
    const err = new Error("invalid-message") as Error & { type: string; cause?: unknown };
    err.type = "invalid-message";
    if (cause) err.cause = cause;
    this.handlers.onError?.(err);
  }

  send(msg: PeerMessage, target?: DataConnection) {
    const payload = JSON.stringify(msg);
    if (target) {
      if (target.open) target.send(payload);
      return;
    }
    for (const c of this.conns.values()) if (c.open) c.send(payload);
  }

  close() {
    this.closed = true;
    if (this.retryTimer !== null) {
      this.clearTimeoutImpl(this.retryTimer);
      this.retryTimer = null;
    }
    for (const c of this.conns.values()) {
      try { c.close(); } catch {
        // already gone
      }
    }
    this.conns.clear();
    try { this.peer?.destroy(); } catch {
      // already destroyed
    }
    this.peer = null;
    this.setState("closed");
  }
}
