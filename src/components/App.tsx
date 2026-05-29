"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionsSidebar, Column, Connectors } from "./Board";
import {
  ActionComposeModal,
  ExportModal,
  HostSetupModal,
  JoinModal,
  SessionEndedModal,
  ShareModal,
} from "./Modals";
import PalettePopover from "./PalettePopover";
import {
  buildActionsChat,
  buildActionsHtml,
  buildMarkdown,
  buildMarkdownHtml,
} from "@/lib/board";
import { applyTheme, rerollRandom } from "@/lib/theme";
import type { BoardState, Participant, SessionInfo } from "@/lib/types";
import { useSession } from "@/hooks/useSession";
import { usePeerNet } from "@/hooks/usePeerNet";
import { useBoardMutators } from "@/hooks/useBoardMutators";

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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingByColumn, setTypingByColumn] = useState<Record<string, Participant[]>>({});
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [composingActionFor, setComposingActionFor] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [actionsCollapsed, setActionsCollapsed] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [pendingFocusCol, setPendingFocusCol] = useState<string | null>(null);

  const prevActionCountRef = useRef(0);
  const prevSharingRef = useRef<boolean | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearEndedTimer = useCallback(() => {
    if (endedTimerRef.current) {
      clearTimeout(endedTimerRef.current);
      endedTimerRef.current = null;
    }
  }, []);

  const cardEls = useRef<Record<string, HTMLDivElement>>({});
  const registerCardEl = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardEls.current[id] = el;
    else delete cardEls.current[id];
  }, []);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);

  // onResetExternal is invoked by useSession.onNewBoard before its own state
  // resets. We thread the closure through a ref so the callback identity stays
  // stable while still seeing the latest peer.closePeer.
  const resetExternalRef = useRef<() => void>(() => {});
  const onResetExternal = useCallback(() => resetExternalRef.current(), []);
  const onHostEstablished = useCallback((newMe: { id: string; name: string; color: string; initial: string }) => {
    setParticipants([{ id: newMe.id, name: newMe.name, color: newMe.color, initial: newMe.initial }]);
  }, []);

  const sess = useSession({ onResetExternal, onHostEstablished });
  const { mode, me, session, board, tweaks, setTweaks, setSession, setBoard, joinToken } = sess;

  // Auto-expand actions sidebar on growth.
  useEffect(() => {
    if (!board) return;
    if (board.actions.length > prevActionCountRef.current) {
      setActionsCollapsed(false);
    }
    prevActionCountRef.current = board.actions.length;
  }, [board]);

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
  }, [session, me, clearEndedTimer]);

  const peerEnabled =
    mode === "board" &&
    !!me &&
    !!session?.code &&
    (me?.isHost ? !!session?.sharing : true);

  const peer = usePeerNet({
    enabled: peerEnabled,
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
  });

  useEffect(() => {
    resetExternalRef.current = () => {
      peer.closePeer();
      setParticipants([]);
      setTypingByColumn({});
      setShowShare(false);
      setShowExport(false);
      setComposingActionFor(null);
      setHoveredLinkId(null);
      setActionsCollapsed(true);
      prevActionCountRef.current = 0;
    };
  }, [peer]);

  const updateBoard = useCallback(
    (fn: (b: BoardState) => BoardState) => {
      setBoard((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        peer.sendBoard(next);
        return next;
      });
    },
    [setBoard, peer],
  );

  const updateSession = useCallback(
    (fn: (s: SessionInfo) => SessionInfo) => {
      setSession((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        queueMicrotask(() => peer.sendSession(next));
        return next;
      });
    },
    [setSession, peer],
  );

  const mutators = useBoardMutators({
    me,
    updateBoard,
    onColumnAdded: setPendingFocusCol,
  });

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

  const openActionCompose = useCallback((parentId: string) => {
    setComposingActionFor(parentId);
  }, []);

  const onCommitAction = useCallback(
    ({ text, assignee, dueDate }: { text: string; assignee: string | null; dueDate: string | null }) => {
      const parentId = composingActionFor;
      if (!parentId) return;
      mutators.commitAction({ parentId, text, assignee, dueDate });
      setComposingActionFor(null);
    },
    [composingActionFor, mutators],
  );

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
  if (mode === "host-setup") return <HostSetupModal onSubmit={sess.onHostSetup} />;
  if (mode === "join") {
    return (
      <JoinModal
        sessionTitle={session?.title || "Sprint Retrospective"}
        hostName={session?.hostName || "Host"}
        onSubmit={sess.onJoin}
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
                    onClick={sess.onNewBoard}>
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
                onAddCard={mutators.addCard}
                onUpdateCard={mutators.updateCard}
                onAddComment={mutators.addComment}
                onReact={mutators.react}
                onCreateAction={openActionCompose}
                onDeleteCard={mutators.deleteCard}
                onRenameColumn={mutators.renameColumn}
                onDeleteColumn={mutators.deleteColumn}
                onLinkHover={setHoveredLinkId}
                onCardDropOnCard={mutators.dropCardOnCard}
                onCardDropAdjacent={mutators.dropCardAdjacent}
                onDropIntoColumn={mutators.dropIntoColumn}
                onUnGroup={mutators.unGroup}
                onRenameGroup={mutators.renameGroup}
                registerCardEl={registerCardEl}
                autoFocusTitle={pendingFocusCol === col.id}
                onTitleFocused={() => setPendingFocusCol(null)}
                typers={(typingByColumn[col.id] || []).filter((p) => p.id !== me.id)}
                onTyping={peer.broadcastTyping}
              />
            ))}
            <div className="add-col">
              <button className="add-card-btn" onClick={mutators.addColumn}>
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
          onUpdateCard={mutators.updateCard}
          onAddComment={mutators.addComment}
          onReact={mutators.react}
          onDeleteCard={mutators.deleteCard}
          onLinkHover={setHoveredLinkId}
          registerCardEl={registerCardEl}
          onDropIntoActions={mutators.dropIntoActions}
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
            peer.sendSession(next);
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
          onCreate={onCommitAction}
        />
      )}
    </div>
  );
}
