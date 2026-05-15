"use client";

import type { DataConnection, Peer as PeerType } from "peerjs";
import type { BoardState, Participant, SessionInfo } from "./types";

export type PeerMessage =
  | { type: "hello"; participant: Participant }
  | { type: "snapshot"; session: SessionInfo; board: BoardState; participants: Participant[] }
  | { type: "board"; board: BoardState }
  | { type: "session"; session: SessionInfo }
  | { type: "presence"; participants: Participant[] }
  | { type: "bye"; participantId: string };

const PEER_ID_PREFIX = "rrretro-v1-";
export const peerIdFor = (code: string) => `${PEER_ID_PREFIX}${code.toLowerCase()}`;

export interface PeerHandlers {
  onOpen?: (id: string) => void;
  onConnect?: (conn: DataConnection) => void;
  onMessage?: (msg: PeerMessage, conn: DataConnection) => void;
  onDisconnect?: (conn: DataConnection) => void;
  onError?: (err: Error) => void;
}

async function loadPeerJs(): Promise<typeof import("peerjs")> {
  return await import("peerjs");
}

export class PeerNet {
  peer: PeerType | null = null;
  conns: Map<string, DataConnection> = new Map();
  handlers: PeerHandlers;

  constructor(handlers: PeerHandlers) {
    this.handlers = handlers;
  }

  async startHost(code: string) {
    const { Peer } = await loadPeerJs();
    this.peer = new Peer(peerIdFor(code));
    this.peer.on("open", (id) => this.handlers.onOpen?.(id));
    this.peer.on("error", (err) => this.handlers.onError?.(err));
    this.peer.on("connection", (conn) => {
      this.attachConn(conn);
    });
  }

  async startGuest(code: string) {
    const { Peer } = await loadPeerJs();
    this.peer = new Peer();
    this.peer.on("open", async (id) => {
      this.handlers.onOpen?.(id);
      const conn = this.peer!.connect(peerIdFor(code), { reliable: true });
      this.attachConn(conn);
    });
    this.peer.on("error", (err) => this.handlers.onError?.(err));
  }

  private attachConn(conn: DataConnection) {
    conn.on("open", () => {
      this.conns.set(conn.peer, conn);
      this.handlers.onConnect?.(conn);
    });
    conn.on("data", (data) => {
      try {
        const msg = (typeof data === "string" ? JSON.parse(data) : data) as PeerMessage;
        this.handlers.onMessage?.(msg, conn);
      } catch (e) {
        // ignore
      }
    });
    conn.on("close", () => {
      this.conns.delete(conn.peer);
      this.handlers.onDisconnect?.(conn);
    });
    conn.on("error", () => {
      this.conns.delete(conn.peer);
      this.handlers.onDisconnect?.(conn);
    });
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
    for (const c of this.conns.values()) {
      try { c.close(); } catch {}
    }
    this.conns.clear();
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
  }
}
