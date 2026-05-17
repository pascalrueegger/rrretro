"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionsSidebar, Column, Connectors } from "./Board";
import { ActionComposeModal, ExportModal, HostSetupModal, JoinModal, SessionEndedModal, ShareModal } from "./Modals";
import PalettePopover from "./PalettePopover";
import {
  buildActionsChat,
  buildActionsHtml,
  buildMarkdown,
  buildMarkdownHtml,
  seedBoard,
} from "@/lib/board";
import { applyTheme, nameColor, rerollRandom } from "@/lib/theme";
import { getPrefs, loadGuestMe, loadSession, resetAll, saveGuestMe, saveSession, setPref } from "@/lib/db";
import { initials, randCode, uid } from "@/lib/util";
import { PeerNet, type PeerMessage } from "@/lib/peer";
import type {
  BoardState,
  Card as CardT,
  Me,
  Participant,
  ReactionKey,
  SessionInfo,
  Tweaks,
} from "@/lib/types";

const DEFAULT_TWEAKS: Tweaks = { theme: "light", density: "regular", flavor: "swiss" };

type Mode = "loading" | "host-setup" | "join" | "board";

function SessionTitleInput({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="session"
      value={value}
      placeholder="Untitled retro"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
      }}
      onBlur={(e) => {
        if (!e.target.value.trim()) onChange("Untitled retro");
      }}
    />
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("loading");
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [me, setMe] = useState<Me | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingByColumn, setTypingByColumn] = useState<Record<string, Participant[]>>({});
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [composingActionFor, setComposingActionFor] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [actionsCollapsed, setActionsCollapsed] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const prevActionCountRef = useRef(0);
  const prevSharingRef = useRef<boolean | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearEndedTimer = useCallback(() => {
    if (endedTimerRef.current) {
      clearTimeout(endedTimerRef.current);
      endedTimerRef.current = null;
    }
  }, []);
  const [pendingFocusCol, setPendingFocusCol] = useState<string | null>(null);

  const joinCode = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(location.search).get("join");
  }, []);

  const cardEls = useRef<Record<string, HTMLDivElement>>({});
  const registerCardEl = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardEls.current[id] = el;
    else delete cardEls.current[id];
  }, []);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);

  // refs for peer callbacks
  const boardRef = useRef<BoardState | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const meRef = useRef<Me | null>(null);
  const peerRef = useRef<PeerNet | null>(null);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => {
    if (!board) return;
    if (board.actions.length > prevActionCountRef.current) {
      setActionsCollapsed(false);
    }
    prevActionCountRef.current = board.actions.length;
  }, [board]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    if (!session || !me) return;
    const sharing = !!session.sharing;
    const prev = prevSharingRef.current;
    if (!me.isHost && prev === true && sharing === false) {
      setShowEnded(true);
    }
    if (!me.isHost && sharing === true) {
      clearEndedTimer();
      setShowEnded(false);
    }
    prevSharingRef.current = sharing;
  }, [session, me]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { meRef.current = me; }, [me]);

  /* ─── tweaks load + apply ─────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPrefs();
      if (cancelled) return;
      if (p?.tweaks) setTweaks(p.tweaks);
      if (joinCode) {
        const guestMe = await loadGuestMe(joinCode);
        if (cancelled) return;
        const session: SessionInfo = {
          id: `s_${joinCode}`,
          title: "Sprint Retrospective",
          code: joinCode,
          hostName: "Host",
          sharing: true,
          createdAt: Date.now(),
        };
        setSession(session);
        if (guestMe) {
          setMe(guestMe);
          setBoard(seedBoard());
          setMode("board");
        } else {
          setMode("join");
        }
      } else if (p?.lastSessionId) {
        const rec = await loadSession(p.lastSessionId);
        if (rec && p.me) {
          setMe(p.me);
          setSession(rec.session);
          setBoard(rec.board);
          if (p.me.isHost) {
            setParticipants([
              { id: p.me.id, name: p.me.name, color: p.me.color, initial: p.me.initial },
            ]);
          }
          setMode("board");
          return;
        }
        setMode("host-setup");
      } else {
        setMode("host-setup");
      }
    })();
    return () => { cancelled = true; };
  }, [joinCode]);

  useEffect(() => {
    applyTheme(tweaks.theme, tweaks.flavor, tweaks.density);
  }, [tweaks.theme, tweaks.flavor, tweaks.density]);

  useEffect(() => {
    setPref({ tweaks });
  }, [tweaks]);

  /* ─── persistence: save session on board / session change ────────── */
  useEffect(() => {
    if (mode !== "board" || !session || !board) return;
    const t = setTimeout(() => {
      saveSession({ session, board }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [mode, session, board]);

  useEffect(() => { if (me?.isHost) setPref({ me }); }, [me]);

  /* ─── P2P ─────────────────────────────────────────────────────────── */
  const broadcastState = useCallback(() => {
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

  const sendToHost = useCallback((msg: PeerMessage) => {
    const peer = peerRef.current;
    if (!peer) return;
    peer.send(msg);
  }, []);

  useEffect(() => {
    if (mode !== "board") return;
    if (!me) return;
    // Host gates on sharing; guest always attempts so they can rejoin when host resumes.
    if (me.isHost && !session?.sharing) return;
    if (!me.isHost && !session?.code) return;

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
            setParticipants((prev) => {
              const others = prev.filter((p) => p.id !== msg.participant.id);
              const next = [...others, msg.participant];
              participantsRef.current = next;
              // send snapshot to the new peer
              const s = sessionRef.current!;
              const b = boardRef.current!;
              net.send({ type: "snapshot", session: s, board: b, participants: next }, conn);
              // broadcast updated presence
              net.send({ type: "presence", participants: next });
              return next;
            });
          } else if (msg.type === "board") {
            setBoard(msg.board);
            boardRef.current = msg.board;
            // broadcast back
            setTimeout(() => broadcastState(), 0);
          } else if (msg.type === "session") {
            setSession(msg.session);
            sessionRef.current = msg.session;
          }
        } else {
          if (msg.type === "snapshot") {
            setSession(msg.session);
            sessionRef.current = msg.session;
            setBoard(msg.board);
            boardRef.current = msg.board;
            setParticipants(msg.participants);
            participantsRef.current = msg.participants;
          } else if (msg.type === "board") {
            setBoard(msg.board);
            boardRef.current = msg.board;
          } else if (msg.type === "session") {
            setSession(msg.session);
            sessionRef.current = msg.session;
          } else if (msg.type === "presence") {
            setParticipants(msg.participants);
            participantsRef.current = msg.participants;
          }
        }
      },
      onConnect: (conn) => {
        if (!me.isHost) {
          clearEndedTimer();
          // guest: introduce ourselves
          const meNow = meRef.current!;
          const p: Participant = {
            id: meNow.id, name: meNow.name, color: meNow.color, initial: meNow.initial,
          };
          net.send({ type: "hello", participant: p }, conn);
        }
      },
      onDisconnect: () => {
        if (meRef.current?.isHost) return;
        // Debounce: host page refresh briefly drops the conn. Only show the
        // ended modal if we can't reconnect within a short grace period.
        clearEndedTimer();
        endedTimerRef.current = setTimeout(() => setShowEnded(true), 4000);
        // Trigger immediate reconnect attempt so a fast host refresh resolves
        // before the modal would appear.
        setRetryTick((n) => n + 1);
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.warn("peer error", err);
        const t = (err as { type?: string }).type;
        if (!meRef.current?.isHost && (t === "peer-unavailable" || t === "network" || t === "server-error")) {
          // Debounce like onDisconnect — a fresh host page-load may briefly
          // be unavailable before its peer is up again.
          if (!endedTimerRef.current) {
            endedTimerRef.current = setTimeout(() => setShowEnded(true), 4000);
          }
          // Schedule another reconnect attempt shortly.
          setTimeout(() => setRetryTick((n) => n + 1), 1500);
        }
      },
    });
    peerRef.current = net;

    const code = session?.code;
    if (!code) return;
    (async () => {
      if (me.isHost) await net.startHost(code);
      else await net.startGuest(code);
    })();

    return () => {
      net.close();
      peerRef.current = null;
    };
  }, [mode, session?.code, session?.sharing, me, broadcastState, retryTick]);

  // While guest is in "session ended" state, retry connecting every 5s.
  useEffect(() => {
    if (!showEnded || !me || me.isHost) return;
    const t = setInterval(() => setRetryTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [showEnded, me]);

  /* ─── Board mutators ─────────────────────────────────────────────── */
  const updateBoard = useCallback(
    (fn: (b: BoardState) => BoardState) => {
      setBoard((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        boardRef.current = next;
        // After commit, broadcast to peers
        queueMicrotask(() => {
          if (meRef.current?.isHost) broadcastState();
          else sendToHost({ type: "board", board: next });
        });
        return next;
      });
    },
    [broadcastState, sendToHost]
  );

  const updateSession = useCallback(
    (fn: (s: SessionInfo) => SessionInfo) => {
      setSession((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        sessionRef.current = next;
        queueMicrotask(() => {
          if (meRef.current?.isHost) {
            peerRef.current?.send({ type: "session", session: next });
          } else {
            sendToHost({ type: "session", session: next });
          }
        });
        return next;
      });
    },
    [sendToHost]
  );

  const addCard = (columnId: string, text: string) => {
    if (!me) return;
    const id = uid("c");
    updateBoard((b) => ({
      ...b,
      cards: {
        ...b.cards,
        [id]: {
          id, columnId, text,
          author: me.name, authorColor: me.color,
          createdAt: Date.now(),
          comments: [],
          reactions: { up: [], celebrate: [], gratitude: [] },
          parentCardId: null,
          actionCardIds: [],
          isAction: false,
        },
      },
      layout: { ...b.layout, [columnId]: [...(b.layout[columnId] || []), { type: "card", id }] },
    }));
  };

  const updateCard = (id: string, patch: Partial<CardT>) => {
    updateBoard((b) => ({ ...b, cards: { ...b.cards, [id]: { ...b.cards[id], ...patch } } }));
  };

  const deleteCard = (id: string) => {
    updateBoard((b) => {
      const card = b.cards[id];
      if (!card) return b;
      const nextCards = { ...b.cards };
      delete nextCards[id];

      const nextLayout: BoardState["layout"] = { ...b.layout };
      const nextGroups = { ...b.groups };
      for (const colId of Object.keys(nextLayout)) {
        nextLayout[colId] = nextLayout[colId].filter((it) => !(it.type === "card" && it.id === id));
      }
      for (const gid of Object.keys(nextGroups)) {
        const g = nextGroups[gid];
        if (g.cardIds.includes(id)) {
          nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== id) };
        }
      }
      const nextActions = b.actions.filter((x) => x !== id);

      if (card.isAction && card.parentCardId && nextCards[card.parentCardId]) {
        nextCards[card.parentCardId] = {
          ...nextCards[card.parentCardId],
          actionCardIds: (nextCards[card.parentCardId].actionCardIds || []).filter((x) => x !== id),
        };
      }
      if (card.actionCardIds?.length) {
        for (const aid of card.actionCardIds) {
          if (nextCards[aid]) nextCards[aid] = { ...nextCards[aid], parentCardId: null };
        }
      }
      return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups, actions: nextActions };
    });
  };

  const addComment = (cardId: string, text: string) => {
    if (!me) return;
    updateBoard((b) => {
      const c = b.cards[cardId];
      if (!c) return b;
      const cm = {
        id: uid("cm"), text,
        author: me.name, authorColor: me.color,
        createdAt: Date.now(),
      };
      return { ...b, cards: { ...b.cards, [cardId]: { ...c, comments: [...c.comments, cm] } } };
    });
  };

  const react = (cardId: string, kind: ReactionKey) => {
    if (!me) return;
    updateBoard((b) => {
      const c = b.cards[cardId];
      if (!c) return b;
      const arr = c.reactions[kind] || [];
      const next = arr.includes(me.name) ? arr.filter((n) => n !== me.name) : [...arr, me.name];
      return { ...b, cards: { ...b.cards, [cardId]: { ...c, reactions: { ...c.reactions, [kind]: next } } } };
    });
  };

  const openActionCompose = (parentId: string) => setComposingActionFor(parentId);

  const commitAction = ({ text, assignee, dueDate }: { text: string; assignee: string | null; dueDate: string | null }) => {
    const parentId = composingActionFor;
    if (!parentId || !me) return;
    updateBoard((b) => {
      const parent = b.cards[parentId];
      if (!parent) return b;
      const id = uid("a");
      const action: CardT = {
        id, columnId: "actions", text,
        author: me.name, authorColor: me.color,
        createdAt: Date.now(),
        comments: [],
        reactions: { up: [], celebrate: [], gratitude: [] },
        parentCardId: parentId,
        actionCardIds: [],
        isAction: true,
        assignee, dueDate,
      };
      return {
        ...b,
        cards: {
          ...b.cards,
          [id]: action,
          [parentId]: { ...parent, actionCardIds: [...(parent.actionCardIds || []), id] },
        },
        actions: [...b.actions, id],
      };
    });
    setComposingActionFor(null);
  };

  const addColumn = () => {
    const id = uid("col");
    updateBoard((b) => ({
      ...b,
      columns: [...b.columns, { id, title: "New column" }],
      layout: { ...b.layout, [id]: [] },
    }));
    setPendingFocusCol(id);
  };
  const renameColumn = (id: string, title: string) => {
    updateBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  };
  const deleteColumn = (id: string) => {
    updateBoard((b) => {
      if (b.columns.length <= 1) return b;
      const items = b.layout[id] || [];
      const cardIdsToRemove: string[] = [];
      const groupIdsToRemove: string[] = [];
      for (const it of items) {
        if (it.type === "group") {
          groupIdsToRemove.push(it.id);
          const g = b.groups[it.id];
          if (g) for (const cid of g.cardIds) cardIdsToRemove.push(cid);
        } else {
          cardIdsToRemove.push(it.id);
        }
      }
      const nextCards = { ...b.cards };
      for (const cid of cardIdsToRemove) {
        const c = nextCards[cid];
        if (!c) continue;
        if (c.actionCardIds?.length) {
          for (const aid of c.actionCardIds) {
            if (nextCards[aid]) nextCards[aid] = { ...nextCards[aid], parentCardId: null };
          }
        }
        delete nextCards[cid];
      }
      const nextGroups = { ...b.groups };
      for (const gid of groupIdsToRemove) delete nextGroups[gid];
      const nextLayout = { ...b.layout };
      delete nextLayout[id];
      return {
        ...b,
        columns: b.columns.filter((c) => c.id !== id),
        layout: nextLayout,
        cards: nextCards,
        groups: nextGroups,
      };
    });
  };

  const dropIntoColumn = (cardId: string, targetColId: string) => {
    updateBoard((b) => {
      const card = b.cards[cardId];
      if (!card) return b;
      if (card.isAction) return b;

      const nextLayout: BoardState["layout"] = { ...b.layout };
      const nextGroups = { ...b.groups };
      for (const gid of Object.keys(nextGroups)) {
        const g = nextGroups[gid];
        if (g.cardIds.includes(cardId)) {
          nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== cardId) };
          if (nextGroups[gid].cardIds.length === 0) {
            delete nextGroups[gid];
            for (const col of Object.keys(nextLayout)) {
              nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
            }
          }
        }
      }
      for (const col of Object.keys(nextLayout)) {
        nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === cardId));
      }
      nextLayout[targetColId] = [...(nextLayout[targetColId] || []), { type: "card", id: cardId }];

      const nextCards = {
        ...b.cards,
        [cardId]: { ...card, columnId: targetColId, groupId: null },
      };
      return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
    });
  };

  const dropIntoActions = (cardId: string) => {
    updateBoard((b) => {
      const card = b.cards[cardId];
      if (!card || !card.isAction) return b;
      const others = b.actions.filter((x) => x !== cardId);
      return { ...b, actions: [...others, cardId] };
    });
  };

  const dropCardOnCard = (draggedId: string, targetId: string) => {
    updateBoard((b) => {
      const dragged = b.cards[draggedId];
      const target = b.cards[targetId];
      if (!dragged || !target) return b;
      if (target.isAction || dragged.isAction) return b;
      if (draggedId === targetId) return b;

      const nextLayout: BoardState["layout"] = { ...b.layout };
      const nextGroups = { ...b.groups };
      const nextCards = { ...b.cards };

      for (const gid of Object.keys(nextGroups)) {
        const g = nextGroups[gid];
        if (g.cardIds.includes(draggedId)) {
          nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== draggedId) };
          if (nextGroups[gid].cardIds.length === 0) {
            delete nextGroups[gid];
            for (const col of Object.keys(nextLayout)) {
              nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
            }
          }
        }
      }
      for (const col of Object.keys(nextLayout)) {
        nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === draggedId));
      }

      const targetColId = target.columnId;
      let hostGroupId: string | null = null;
      for (const gid of Object.keys(nextGroups)) {
        if (nextGroups[gid].cardIds.includes(targetId)) { hostGroupId = gid; break; }
      }

      if (hostGroupId) {
        const g = nextGroups[hostGroupId];
        nextGroups[hostGroupId] = { ...g, cardIds: [...g.cardIds, draggedId] };
        nextCards[draggedId] = { ...dragged, columnId: g.columnId };
      } else {
        const gid = uid("g");
        nextGroups[gid] = { id: gid, columnId: targetColId, label: "Cluster", cardIds: [targetId, draggedId] };
        nextLayout[targetColId] = nextLayout[targetColId].map((it) =>
          it.type === "card" && it.id === targetId ? { type: "group", id: gid } : it
        );
        nextCards[draggedId] = { ...dragged, columnId: targetColId };
      }
      return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
    });
  };

  const dropCardAdjacent = (draggedId: string, targetId: string, where: "before" | "after") => {
    updateBoard((b) => {
      const dragged = b.cards[draggedId];
      const target = b.cards[targetId];
      if (!dragged || !target) return b;
      if (target.isAction || dragged.isAction) return b;
      if (draggedId === targetId) return b;

      const nextLayout: BoardState["layout"] = { ...b.layout };
      const nextGroups = { ...b.groups };
      const nextCards = { ...b.cards };

      for (const gid of Object.keys(nextGroups)) {
        const g = nextGroups[gid];
        if (g.cardIds.includes(draggedId)) {
          nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== draggedId) };
          if (nextGroups[gid].cardIds.length === 0) {
            delete nextGroups[gid];
            for (const col of Object.keys(nextLayout)) {
              nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
            }
          }
        }
      }
      for (const col of Object.keys(nextLayout)) {
        nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === draggedId));
      }

      let targetGroupId: string | null = null;
      for (const gid of Object.keys(nextGroups)) {
        if (nextGroups[gid].cardIds.includes(targetId)) { targetGroupId = gid; break; }
      }

      if (targetGroupId) {
        const g = nextGroups[targetGroupId];
        const idx = g.cardIds.indexOf(targetId);
        const insertAt = where === "before" ? idx : idx + 1;
        const ids = [...g.cardIds];
        ids.splice(insertAt, 0, draggedId);
        nextGroups[targetGroupId] = { ...g, cardIds: ids };
        nextCards[draggedId] = { ...dragged, columnId: g.columnId };
      } else {
        const colId = target.columnId;
        const items = nextLayout[colId] || [];
        const idx = items.findIndex((it) => it.type === "card" && it.id === targetId);
        const insertAt = idx < 0 ? items.length : where === "before" ? idx : idx + 1;
        nextLayout[colId] = [
          ...items.slice(0, insertAt),
          { type: "card", id: draggedId },
          ...items.slice(insertAt),
        ];
        nextCards[draggedId] = { ...dragged, columnId: colId };
      }
      return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
    });
  };

  const unGroup = (groupId: string) => {
    updateBoard((b) => {
      const g = b.groups[groupId];
      if (!g) return b;
      const nextGroups = { ...b.groups };
      delete nextGroups[groupId];
      const nextLayout: BoardState["layout"] = { ...b.layout };
      const items = nextLayout[g.columnId] || [];
      const idx = items.findIndex((it) => it.type === "group" && it.id === groupId);
      if (idx >= 0) {
        const expanded = g.cardIds.map((cid) => ({ type: "card" as const, id: cid }));
        nextLayout[g.columnId] = [...items.slice(0, idx), ...expanded, ...items.slice(idx + 1)];
      }
      return { ...b, layout: nextLayout, groups: nextGroups };
    });
  };

  const renameGroup = (groupId: string, label: string) => {
    updateBoard((b) => ({
      ...b,
      groups: { ...b.groups, [groupId]: { ...b.groups[groupId], label } },
    }));
  };

  /* ─── Host / Join setup ─────────────────────────────────────────── */
  const onHostSetup = ({ name, title }: { name: string; title: string }) => {
    const color = nameColor(name);
    const newMe: Me = { id: uid("u"), name, color, initial: initials(name), isHost: true };
    const code = randCode();
    const newSession: SessionInfo = {
      id: `s_${code}`,
      title, code, hostName: name,
      sharing: true,
      createdAt: Date.now(),
    };
    setMe(newMe);
    setSession(newSession);
    setBoard(seedBoard());
    setParticipants([{ id: newMe.id, name: newMe.name, color: newMe.color, initial: newMe.initial }]);
    setMode("board");
  };

  const broadcastTyping = useCallback((columnId: string, active: boolean) => {
    const meNow = meRef.current;
    if (!meNow) return;
    const participant: Participant = {
      id: meNow.id, name: meNow.name, color: meNow.color, initial: meNow.initial,
    };
    const msg: PeerMessage = { type: "typing", participant, columnId, active };
    if (meNow.isHost) {
      peerRef.current?.send(msg);
    } else {
      peerRef.current?.send(msg); // guest → host; host will rebroadcast
    }
  }, []);

  // Prune typers no longer in the room.
  useEffect(() => {
    setTypingByColumn((prev) => {
      const ids = new Set(participants.map((p) => p.id));
      const next: typeof prev = {};
      for (const col of Object.keys(prev)) {
        const filtered = prev[col].filter((p) => ids.has(p.id));
        if (filtered.length) next[col] = filtered;
      }
      return next;
    });
  }, [participants]);

  const onNewBoard = async () => {
    if (typeof window !== "undefined" &&
        !window.confirm("Start a new board? This will discard the current retro.")) {
      return;
    }
    try { await resetAll(); } catch {}
    peerRef.current?.close();
    peerRef.current = null;
    setShowShare(false);
    setShowExport(false);
    setComposingActionFor(null);
    setHoveredLinkId(null);
    setActionsCollapsed(true);
    setParticipants([]);
    setBoard(null);
    setSession(null);
    setMe(null);
    prevActionCountRef.current = 0;
    setMode("host-setup");
  };

  const onJoin = ({ name }: { name: string }) => {
    const color = nameColor(name);
    const newMe: Me = { id: uid("u"), name, color, initial: initials(name), isHost: false };
    setMe(newMe);
    setBoard(seedBoard());
    setMode("board");
    if (joinCode) saveGuestMe(joinCode, newMe).catch(() => {});
  };

  /* ─── connector link pairs ──────────────────────────────────────── */
  const linkPairs = useMemo<[string, string][]>(() => {
    if (!board || !hoveredLinkId) return [];
    const c = board.cards[hoveredLinkId];
    if (!c) return [];
    const pairs: [string, string][] = [];
    if (c.isAction && c.parentCardId) pairs.push([c.id, c.parentCardId]);
    if (!c.isAction) {
      for (const aid of c.actionCardIds || []) pairs.push([c.id, aid]);
    }
    return pairs;
  }, [hoveredLinkId, board]);

  /* ─── Render ─────────────────────────────────────────────────────── */
  if (mode === "loading") return null;
  if (mode === "host-setup") return <HostSetupModal onSubmit={onHostSetup} />;
  if (mode === "join") {
    return (
      <JoinModal
        sessionTitle={session?.title || "Sprint Retrospective"}
        hostName={session?.hostName || "Host"}
        onSubmit={onJoin}
      />
    );
  }

  if (!board || !session || !me) return null;

  const md = buildMarkdown(board, session.title, session.hostName);
  const mdHtml = buildMarkdownHtml(board, session.title, session.hostName);
  const actionsChat = buildActionsChat(board, session.title);
  const actionsHtml = buildActionsHtml(board, session.title);

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-brand">
          <span className="mark" />
          <span className="name">RRRetro</span>
          <SessionTitleInput
            value={session.title}
            onChange={(v) => updateSession((s) => ({ ...s, title: v }))}
          />
        </div>

        <div className="presence">
          <span className="avatar" style={{ background: me.color }} title={`${me.name} (you)`}>{me.initial}</span>
          {participants.filter((p) => p.id !== me.id).map((p) => (
            <span key={p.id} className="avatar" style={{ background: p.color }} title={p.name}>{p.initial}</span>
          ))}
        </div>

        <PalettePopover
          theme={tweaks.theme}
          flavor={tweaks.flavor}
          density={tweaks.density}
          onTheme={(v) => setTweaks((t) => ({ ...t, theme: v }))}
          onFlavor={(v) => setTweaks((t) => ({ ...t, flavor: v }))}
          onDensity={(v) => setTweaks((t) => ({ ...t, density: v }))}
          onReroll={() => { rerollRandom(); applyTheme("random", tweaks.flavor, tweaks.density); }}
        />

        <div className="divider-v" />

        <div className="bar-actions">
          <button type="button" className="btn" onClick={() => setShowExport(true)}>Export</button>
          {me.isHost && (
            <button type="button"
                    className={`btn ${session.sharing ? "btn-primary" : ""}`}
                    onClick={() => setShowShare(true)}>
              {session.sharing
                ? <><span className="share-dot on" /> Share</>
                : <><span className="share-dot off" /> Sharing off</>}
            </button>
          )}
          {me.isHost && (
            <button type="button"
                    className="btn btn-ghost btn-icon"
                    title="New board (resets current retro)"
                    aria-label="New board"
                    onClick={onNewBoard}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className={`board ${actionsCollapsed ? "actions-collapsed" : ""}`} ref={boardWrapRef}>
        <div className="board-scroll">
          <div className="board-rail">
            {board.columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                layout={board.layout}
                cards={board.cards}
                groups={board.groups}
                me={me}
                hoveredLinkId={hoveredLinkId}
                onAddCard={addCard}
                onUpdateCard={updateCard}
                onAddComment={addComment}
                onReact={react}
                onCreateAction={openActionCompose}
                onDeleteCard={deleteCard}
                onRenameColumn={renameColumn}
                onDeleteColumn={deleteColumn}
                onLinkHover={setHoveredLinkId}
                onCardDropOnCard={dropCardOnCard}
                onCardDropAdjacent={dropCardAdjacent}
                onDropIntoColumn={dropIntoColumn}
                onUnGroup={unGroup}
                onRenameGroup={renameGroup}
                registerCardEl={registerCardEl}
                autoFocusTitle={pendingFocusCol === col.id}
                onTitleFocused={() => setPendingFocusCol(null)}
                typers={(typingByColumn[col.id] || []).filter((p) => p.id !== me.id)}
                onTyping={broadcastTyping}
              />
            ))}
            <div className="add-col">
              <button className="add-card-btn" onClick={addColumn}>
                <span className="plus">+</span> Add column
              </button>
            </div>
          </div>
        </div>

        <ActionsSidebar
          actionIds={board.actions}
          cards={board.cards}
          me={me}
          hoveredLinkId={hoveredLinkId}
          collapsed={actionsCollapsed}
          onToggle={() => setActionsCollapsed((c) => !c)}
          onUpdateCard={updateCard}
          onAddComment={addComment}
          onReact={react}
          onDeleteCard={deleteCard}
          onLinkHover={setHoveredLinkId}
          registerCardEl={registerCardEl}
          onDropIntoActions={dropIntoActions}
        />

        <Connectors pairs={linkPairs} cardEls={cardEls} containerEl={boardWrapRef.current} />
      </div>

      {showShare && (
        <ShareModal
          session={session}
          host={{ name: me.name, color: me.color, initial: me.initial }}
          participants={participants.filter((p) => p.id !== me.id)}
          sharing={!!session.sharing}
          onToggleSharing={() => {
            if (!session) return;
            const next = { ...session, sharing: !session.sharing };
            // Send to peers BEFORE state change so the cleanup of the peer
            // effect (triggered by sharing flipping false) can't race us.
            peerRef.current?.send({ type: "session", session: next });
            sessionRef.current = next;
            setSession(next);
          }}
          onClose={() => setShowShare(false)}
        />
      )}
      {showExport && (
        <ExportModal
          markdown={md}
          markdownHtml={mdHtml}
          actionsChat={actionsChat}
          actionsHtml={actionsHtml}
          sessionTitle={session.title}
          hasActions={board.actions.length}
          onClose={() => setShowExport(false)}
        />
      )}
      {showEnded && <SessionEndedModal />}
      {composingActionFor && board.cards[composingActionFor] && (
        <ActionComposeModal
          parentCard={board.cards[composingActionFor]}
          me={me}
          onCancel={() => setComposingActionFor(null)}
          onCreate={commitAction}
        />
      )}
    </div>
  );
}
