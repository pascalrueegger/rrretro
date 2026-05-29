"use client";

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { normalizeBoard } from "@/lib/board";
import { PeerNet, verifyHelloToken, type PeerMessage } from "@/lib/peer";
import type { BoardState, Me, Participant, SessionInfo } from "@/lib/types";

export interface UsePeerNetArgs {
  enabled: boolean;
  me: Me | null;
  session: SessionInfo | null;
  board: BoardState | null;
  participants: Participant[];
  joinToken: string | null;
  setSession: Dispatch<SetStateAction<SessionInfo | null>>;
  setBoard: Dispatch<SetStateAction<BoardState | null>>;
  setParticipants: Dispatch<SetStateAction<Participant[]>>;
  setTypingByColumn: Dispatch<SetStateAction<Record<string, Participant[]>>>;
  setShowEnded: Dispatch<SetStateAction<boolean>>;
  clearEndedTimer: () => void;
  endedTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export interface UsePeerNetResult {
  sendBoard: (next: BoardState) => void;
  sendSession: (next: SessionInfo) => void;
  broadcastTyping: (columnId: string, active: boolean) => void;
  broadcastSnapshot: () => void;
  closePeer: () => void;
}

export function usePeerNet(args: UsePeerNetArgs): UsePeerNetResult {
  const {
    enabled,
    me,
    session,
    board,
    participants,
    joinToken,
    setSession,
    setBoard,
    setParticipants,
    setTypingByColumn,
    setShowEnded,
    clearEndedTimer,
    endedTimerRef,
  } = args;

  const boardRef = useRef<BoardState | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const meRef = useRef<Me | null>(null);
  const peerRef = useRef<PeerNet | null>(null);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { meRef.current = me; }, [me]);

  const broadcastSnapshot = useCallback(() => {
    const peer = peerRef.current;
    const s = sessionRef.current;
    const b = boardRef.current;
    if (!peer || !s || !b) return;
    if (!meRef.current?.isHost) return;
    peer.send({
      type: "snapshot",
      session: s,
      board: b,
      participants: participantsRef.current,
    });
  }, []);

  const sessionCode = session?.code;

  useEffect(() => {
    if (!enabled || !me) return;

    const net = new PeerNet({
      onMessage: (msg, conn) => {
        if (msg.type === "typing") {
          setTypingByColumn((prev) => {
            const cur = prev[msg.columnId] || [];
            const others = cur.filter((p) => p.id !== msg.participant.id);
            const next = msg.active ? [...others, msg.participant] : others;
            return { ...prev, [msg.columnId]: next };
          });
          if (me.isHost) net.send(msg); // rebroadcast to all guests
          return;
        }
        if (me.isHost) {
          if (msg.type === "hello") {
            const sess = sessionRef.current!;
            const ok = verifyHelloToken({
              expected: sess.joinToken,
              provided: msg.token,
            });
            if (!ok) {
              net.send({ type: "reject", reason: "bad-token" }, conn);
              try { conn.close(); } catch {}
              return;
            }
            setParticipants((prev) => {
              const others = prev.filter((p) => p.id !== msg.participant.id);
              const next = [...others, msg.participant];
              participantsRef.current = next;
              const s = sessionRef.current!;
              const b = boardRef.current!;
              net.send({ type: "snapshot", session: s, board: b, participants: next }, conn);
              net.send({ type: "presence", participants: next });
              return next;
            });
          } else if (msg.type === "board") {
            const nb = normalizeBoard(msg.board);
            setBoard(nb);
            boardRef.current = nb;
            setTimeout(() => broadcastSnapshot(), 0);
          } else if (msg.type === "session") {
            setSession(msg.session);
            sessionRef.current = msg.session;
          }
        } else {
          if (msg.type === "snapshot") {
            setSession(msg.session);
            sessionRef.current = msg.session;
            const nb = normalizeBoard(msg.board);
            setBoard(nb);
            boardRef.current = nb;
            setParticipants(msg.participants);
            participantsRef.current = msg.participants;
          } else if (msg.type === "board") {
            const nb = normalizeBoard(msg.board);
            setBoard(nb);
            boardRef.current = nb;
          } else if (msg.type === "session") {
            setSession(msg.session);
            sessionRef.current = msg.session;
          } else if (msg.type === "presence") {
            setParticipants(msg.participants);
            participantsRef.current = msg.participants;
          } else if (msg.type === "reject") {
            // Host refused us. Treat like session ended — modal explains it.
            clearEndedTimer();
            setShowEnded(true);
          }
        }
      },
      onConnect: (conn) => {
        if (!me.isHost) {
          clearEndedTimer();
          const meNow = meRef.current!;
          const p: Participant = {
            id: meNow.id, name: meNow.name, color: meNow.color, initial: meNow.initial,
          };
          net.send(
            { type: "hello", participant: p, token: joinToken ?? undefined },
            conn,
          );
        }
      },
      onState: (state) => {
        if (meRef.current?.isHost) return;
        if (state === "open") {
          clearEndedTimer();
          setShowEnded(false);
        } else if (state === "reconnecting") {
          if (!endedTimerRef.current) {
            // Grace before surfacing the ended modal — covers host page refresh.
            endedTimerRef.current = setTimeout(() => setShowEnded(true), 4000);
          }
        }
      },
      onError: (err) => {
        console.warn("peer error", err);
      },
    });
    peerRef.current = net;

    if (!sessionCode) return;
    (async () => {
      if (me.isHost) await net.startHost(sessionCode);
      else await net.startGuest(sessionCode);
    })();

    return () => {
      net.close();
      peerRef.current = null;
    };
  }, [
    enabled,
    me,
    sessionCode,
    joinToken,
    broadcastSnapshot,
    clearEndedTimer,
    endedTimerRef,
    setBoard,
    setSession,
    setParticipants,
    setTypingByColumn,
    setShowEnded,
  ]);

  const sendBoard = useCallback((next: BoardState) => {
    boardRef.current = next;
    queueMicrotask(() => {
      const peer = peerRef.current;
      if (!peer) return;
      if (meRef.current?.isHost) {
        broadcastSnapshot();
      } else {
        peer.send({ type: "board", board: next });
      }
    });
  }, [broadcastSnapshot]);

  const sendSession = useCallback((next: SessionInfo) => {
    sessionRef.current = next;
    peerRef.current?.send({ type: "session", session: next });
  }, []);

  const broadcastTyping = useCallback((columnId: string, active: boolean) => {
    const meNow = meRef.current;
    if (!meNow) return;
    const participant: Participant = {
      id: meNow.id, name: meNow.name, color: meNow.color, initial: meNow.initial,
    };
    const msg: PeerMessage = { type: "typing", participant, columnId, active };
    peerRef.current?.send(msg);
  }, []);

  const closePeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  return { sendBoard, sendSession, broadcastTyping, broadcastSnapshot, closePeer };
}
