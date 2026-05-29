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
  buildActionsChat,
  buildActionsHtml,
  buildMarkdown,
  buildMarkdownHtml,
  normalizeBoard,
  seedBoard,
} from "@/lib/board";
import { applyTheme, nameColor, rerollRandom } from "@/lib/theme";
import { deleteSession, getPrefs, loadGuestMe, loadSession, saveGuestMe, saveSession, setPref } from "@/lib/db";
import { initials, makeJoinToken, randCode, uid } from "@/lib/util";
import { PeerNet, verifyHelloToken, type PeerMessage } from "@/lib/peer";
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
  value, onChange, readOnly,
}: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <input
      className="session"
      value={value}
      placeholder="Untitled retro"
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : 0}
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
  const joinToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = location.hash.replace(/^#/, "");
    return new URLSearchParams(hash).get("k");
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
  // Syncs guest-side ended-modal visibility to host's sharing transitions.
  // setState here is intentional: clearEndedTimer (clearTimeout) and the
  // prevSharingRef mount-time semantics resist a clean render-phase refactor.
  useEffect(() => {
    if (!session || !me) return;
    const sharing = !!session.sharing;
    const prev = prevSharingRef.current;
    if (!me.isHost && prev === true && sharing === false) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowEnded(true);
    }
    if (!me.isHost && sharing === true) {
      clearEndedTimer();
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          setMode("board");
        } else {
          setMode("join");
        }
      } else if (p?.lastSessionId) {
        const rec = await loadSession(p.lastSessionId);
        if (rec && p.me) {
          // Backfill joinToken for sessions persisted before this field existed.
          // Save effect picks up the new token on next change.
          const sess = rec.session.joinToken
            ? rec.session
            : { ...rec.session, joinToken: makeJoinToken() };
          setMe(p.me);
          setSession(sess);
          setBoard(normalizeBoard(rec.board));
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

  // Preconditions for an active peer connection. Host tears down when sharing
  // flips off; guest stays up across sharing changes so it can resume.
  const peerActive =
    mode === "board" &&
    !!me &&
    !!session?.code &&
    (me?.isHost ? !!session?.sharing : true);

  useEffect(() => {
    if (!peerActive || !me) return;

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
              // send snapshot to the new peer
              const s = sessionRef.current!;
              const b = boardRef.current!;
              net.send({ type: "snapshot", session: s, board: b, participants: next }, conn);
              // broadcast updated presence
              net.send({ type: "presence", participants: next });
              return next;
            });
          } else if (msg.type === "board") {
            const nb = normalizeBoard(msg.board);
            setBoard(nb);
            boardRef.current = nb;
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
          // guest: introduce ourselves
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
  }, [peerActive, me, session?.code, broadcastState, joinToken, clearEndedTimer]);

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
    const author = { id: me.id, name: me.name, color: me.color };
    updateBoard((b) => applyAddCard(b, { id, columnId, text, author }));
  };

  const updateCard = (id: string, patch: Partial<CardT>) => {
    updateBoard((b) => applyUpdateCard(b, { id, patch }));
  };

  const deleteCard = (id: string) => {
    updateBoard((b) => applyDeleteCard(b, { id }));
  };

  const addComment = (cardId: string, text: string) => {
    if (!me) return;
    const commentId = uid("cm");
    const author = { id: me.id, name: me.name, color: me.color };
    updateBoard((b) => applyAddComment(b, { cardId, commentId, text, author }));
  };

  const react = (cardId: string, kind: ReactionKey) => {
    if (!me) return;
    const voter = { id: me.id, name: me.name };
    updateBoard((b) => applyReact(b, { cardId, kind, voter }));
  };

  const openActionCompose = (parentId: string) => setComposingActionFor(parentId);

  const commitAction = ({ text, assignee, dueDate }: { text: string; assignee: string | null; dueDate: string | null }) => {
    const parentId = composingActionFor;
    if (!parentId || !me) return;
    const id = uid("a");
    const author = { id: me.id, name: me.name, color: me.color };
    updateBoard((b) => applyCommitAction(b, { id, parentId, text, author, assignee, dueDate }));
    setComposingActionFor(null);
  };

  const addColumn = () => {
    const id = uid("col");
    updateBoard((b) => applyAddColumn(b, { id, title: "New column" }));
    setPendingFocusCol(id);
  };
  const renameColumn = (id: string, title: string) => {
    updateBoard((b) => applyRenameColumn(b, { id, title }));
  };
  const deleteColumn = (id: string) => {
    updateBoard((b) => applyDeleteColumn(b, { id }));
  };

  const dropIntoColumn = (cardId: string, targetColId: string) => {
    updateBoard((b) => applyDropIntoColumn(b, { cardId, targetColId }));
  };

  const dropIntoActions = (cardId: string) => {
    updateBoard((b) => applyDropIntoActions(b, { cardId }));
  };

  const dropCardOnCard = (draggedId: string, targetId: string) => {
    const newGroupId = uid("g");
    updateBoard((b) => applyDropCardOnCard(b, { draggedId, targetId, newGroupId }));
  };

  const dropCardAdjacent = (draggedId: string, targetId: string, where: "before" | "after") => {
    updateBoard((b) => applyDropCardAdjacent(b, { draggedId, targetId, where }));
  };

  const unGroup = (groupId: string) => {
    updateBoard((b) => applyUnGroup(b, { groupId }));
  };

  const renameGroup = (groupId: string, label: string) => {
    updateBoard((b) => applyRenameGroup(b, { groupId, label }));
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
      joinToken: makeJoinToken(),
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
  const [prevParticipants, setPrevParticipants] = useState(participants);
  if (prevParticipants !== participants) {
    setPrevParticipants(participants);
    setTypingByColumn((prev) => {
      const ids = new Set(participants.map((p) => p.id));
      const next: typeof prev = {};
      for (const col of Object.keys(prev)) {
        const filtered = prev[col].filter((p) => ids.has(p.id));
        if (filtered.length) next[col] = filtered;
      }
      return next;
    });
  }

  const onNewBoard = async () => {
    if (typeof window !== "undefined" &&
        !window.confirm("Start a new board? This will discard the current retro.")) {
      return;
    }
    try {
      // Only drop the current session row + the lastSessionId pointer.
      // Preserve user prefs (me, tweaks) and guestMe cache for other codes.
      if (session?.id) await deleteSession(session.id);
      await setPref({ lastSessionId: undefined });
    } catch {}
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

  if (!session || !me) return null;
  if (!board) {
    return (
      <div className="scrim">
        <div className="modal" style={{ textAlign: "center" }}>
          <h2>Connecting…</h2>
          <p className="sub">Waiting for the host to sync the board.</p>
        </div>
      </div>
    );
  }

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
            readOnly={!me.isHost}
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
