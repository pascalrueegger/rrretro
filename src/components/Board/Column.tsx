"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { BoardState, Card as CardT, Me, Participant, ReactionKey } from "@/lib/types";
import { initials } from "@/lib/util";
import { Card } from "./Card";
import { GroupView } from "./GroupView";
import { dragCtx } from "./dragCtx";

interface ColumnProps {
  column: { id: string; title: string; locked?: boolean };
  layout: BoardState["layout"];
  cards: BoardState["cards"];
  groups: BoardState["groups"];
  me: Me;
  hoveredLinkId: string | null;
  onAddCard: (columnId: string, text: string) => void;
  onUpdateCard: (id: string, patch: Partial<CardT>) => void;
  onAddComment: (cardId: string, text: string) => void;
  onReact: (cardId: string, kind: ReactionKey) => void;
  onCreateAction: (parentId: string) => void;
  onDeleteCard: (id: string) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onLinkHover: (id: string | null) => void;
  onCardDropOnCard: (draggedId: string, targetId: string) => void;
  onCardDropAdjacent: (draggedId: string, targetId: string, where: "before" | "after") => void;
  onDropIntoColumn: (cardId: string, targetColId: string) => void;
  onUnGroup: (id: string) => void;
  onRenameGroup: (id: string, label: string) => void;
  registerCardEl: (id: string, el: HTMLDivElement | null) => void;
  autoFocusTitle: boolean;
  onTitleFocused: () => void;
  typers: Participant[];
  onTyping: (columnId: string, active: boolean) => void;
}

export function Column(props: ColumnProps) {
  const {
    column, layout, cards, groups, me, hoveredLinkId,
    onAddCard, onUpdateCard, onAddComment, onReact, onCreateAction, onDeleteCard,
    onRenameColumn, onDeleteColumn, onLinkHover, onCardDropOnCard, onCardDropAdjacent,
    onDropIntoColumn, onUnGroup, onRenameGroup, registerCardEl,
    autoFocusTitle, onTitleFocused, typers, onTyping,
  } = props;
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const items = layout[column.id] || [];

  useEffect(() => { if (adding) draftRef.current?.focus(); }, [adding]);
  useLayoutEffect(() => {
    if (!adding) return;
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draftText, adding]);

  // Broadcast typing state when draft is open.
  useEffect(() => {
    if (!adding) return;
    onTyping(column.id, true);
    return () => onTyping(column.id, false);
  }, [adding, column.id, onTyping]);
  useEffect(() => {
    if (autoFocusTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
      onTitleFocused();
    }
  }, [autoFocusTitle, onTitleFocused]);

  const submitDraft = () => {
    const t = draftText.trim();
    if (t) onAddCard(column.id, t);
    setDraftText("");
    setAdding(false);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragCtx.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    if (!dragCtx.current) return;
    e.preventDefault();
    const draggedId = dragCtx.current.cardId;
    const dragged = cards[draggedId];
    // already in this column → keep position; only move when crossing columns
    if (dragged && dragged.columnId === column.id) return;
    onDropIntoColumn(draggedId, column.id);
  };

  return (
    <div className="column">
      <div className="col-head">
        <input className="col-title"
               ref={titleRef}
               value={column.title}
               placeholder="Column title"
               onChange={(e) => onRenameColumn(column.id, e.target.value)} />
        {(() => {
          const count = items.reduce(
            (n, it) =>
              n + (it.type === "group" ? (groups[it.id]?.cardIds.length || 0) : 1),
            0
          );
          return (
            <>
              {count > 0 && <span className="col-count">{count}</span>}
              {!column.locked && me.isHost && count === 0 && (
                <button type="button" className="btn btn-ghost btn-sm col-menu"
                        title="Delete column"
                        onClick={() => onDeleteColumn(column.id)}>×</button>
              )}
            </>
          );
        })()}
      </div>

      <div className={`col-body ${dragOver ? "drag-over" : ""}`}
           onDragOver={onDragOver}
           onDragLeave={onDragLeave}
           onDrop={onDrop}>
        {items.map((it) => {
          if (it.type === "group") {
            const g = groups[it.id];
            if (!g) return null;
            return (
              <GroupView key={`g-${g.id}`} group={g}
                         onUnGroup={onUnGroup} onRenameGroup={onRenameGroup}>
                {g.cardIds.map((cid) => cards[cid] && (
                  <Card key={cid} card={cards[cid]} me={me}
                        hoveredLinkId={hoveredLinkId}
                        onUpdate={onUpdateCard} onAddComment={onAddComment}
                        onReact={onReact} onCreateAction={onCreateAction}
                        onDelete={onDeleteCard}
                        onLinkHover={onLinkHover}
                        onCardDropOnCard={onCardDropOnCard}
                        onCardDropAdjacent={onCardDropAdjacent}
                        parentColumnId={column.id}
                        groupId={g.id}
                        registerCardEl={registerCardEl} />
                ))}
              </GroupView>
            );
          }
          const c = cards[it.id];
          if (!c) return null;
          return (
            <Card key={c.id} card={c} me={me}
                  hoveredLinkId={hoveredLinkId}
                  onUpdate={onUpdateCard} onAddComment={onAddComment}
                  onReact={onReact} onCreateAction={onCreateAction}
                  onDelete={onDeleteCard}
                  onLinkHover={onLinkHover}
                  onCardDropOnCard={onCardDropOnCard}
                  onCardDropAdjacent={onCardDropAdjacent}
                  parentColumnId={column.id}
                  registerCardEl={registerCardEl} />
          );
        })}

        {typers.length > 0 && (
          <div className="col-typing" title={typers.map((t) => t.name).join(", ")}>
            <span className="col-typing-avatars">
              {typers.slice(0, 3).map((t) => (
                <span key={t.id} className="avatar" style={{ background: t.color }}>{t.initial}</span>
              ))}
            </span>
            <span className="col-typing-text">
              {typers.length === 1 ? `${typers[0].name} is writing` : `${typers.length} people writing`}
              <span className="col-typing-dots"><i /><i /><i /></span>
            </span>
          </div>
        )}

        {adding ? (
          <div className="card" style={{ cursor: "default" }}>
            <div className="card-head">
              <span className="avatar" style={{ background: me.color }}>{initials(me.name)}</span>
              <span className="card-author">{me.name}</span>
            </div>
            <textarea ref={draftRef}
                      className="card-body-input"
                      rows={2}
                      placeholder="What's on your mind?"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onBlur={submitDraft}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitDraft(); }
                        if (e.key === "Escape") { setDraftText(""); setAdding(false); }
                      }} />
            <div className="hint" style={{ marginTop: 4 }}>
              <span className="kbd">↵</span> save · <span className="kbd">esc</span> cancel
            </div>
          </div>
        ) : (
          <button className="add-card-btn" onClick={() => setAdding(true)}>
            <span className="plus">+</span> Add card
          </button>
        )}
      </div>
    </div>
  );
}
